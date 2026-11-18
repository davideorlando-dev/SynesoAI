from enum import Enum
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.logging_setup import get_logger
from app.agents.synthesizer import get_relevant_chunks_for_topic
from app.core.llm import call_llm_structured
from app.db.models import Document, Topic

log = get_logger("app.agents.feynman")


class RubricStatus(str, Enum):
    COVERED = "COVERED"
    PARTIAL = "PARTIAL"
    MISSING = "MISSING"


class RubricCriterionSchema(BaseModel):
    concept: str = Field(description="Key concept, rule, or distinction expected from the course PDF")
    weight: int = Field(default=2, ge=1, le=3, description="1=detail, 2=important, 3=core pillar")
    status: RubricStatus
    evidence: str = Field(description="Short evidence comparing student's explanation against the PDF")
    doc_index: int = Field(default=1, description="1-based document index from [D1], [D2]")
    source_page: int | None = Field(default=None, description="Exact PDF page number from ground truth")
    source_doc_id: str | None = Field(default=None, exclude=True)


class GapFlashcardSchema(BaseModel):
    front: str = Field(description="Targeted question testing the missed or misunderstood concept")
    back: str = Field(description="Clear, accurate answer grounded in the course material")


class FeynmanEvaluationResult(BaseModel):
    rubric: list[RubricCriterionSchema] = Field(
        default_factory=list,
        description="4 to 6 verifiable rubric criteria grounded in the PDF material",
    )
    mastery_score: int = Field(description="Score from 0 to 100")
    passed: bool = Field(description="True if mastery_score >= 75 and no major conceptual gaps")
    understood_points: list[str]
    missing_or_wrong: list[str]
    socratic_followup: str = Field(
        description="One targeted question to fix the student's biggest gap, or a deeper challenge if passed."
    )
    gap_flashcards: list[GapFlashcardSchema] = Field(default_factory=list)


def evaluate_feynman_explanation(
    session: Session,
    topic: Topic,
    student_explanation: str,
    prior_transcript: list[dict] | None = None,
    prior_rubric: list[dict] | None = None,
) -> FeynmanEvaluationResult:
    docs = session.exec(
        select(Document).where(Document.exam_id == topic.exam_id).order_by(Document.created_at)
    ).all()
    doc_id_by_index = {idx + 1: d.id for idx, d in enumerate(docs)}
    index_by_doc_id = {d.id: idx + 1 for idx, d in enumerate(docs)}

    chunks = get_relevant_chunks_for_topic(session, topic, limit=5)
    allowed_doc_pages = {(c.document_id, c.page_number) for c in chunks}
    unique_doc_for_page: dict[int, str | None] = {}
    for c in chunks:
        if c.page_number not in unique_doc_for_page:
            unique_doc_for_page[c.page_number] = c.document_id
        elif unique_doc_for_page[c.page_number] != c.document_id:
            unique_doc_for_page[c.page_number] = None

    ground_truth = "\n\n".join(
        f"[D{index_by_doc_id.get(c.document_id, 1)} | Page {c.page_number}]\n{c.text[:850]}"
        for c in chunks
    )

    history_block = ""
    if prior_transcript:
        recent = prior_transcript[-4:]
        formatted_turns = "\n".join(
            f"{'STUDENT' if t.get('role') == 'student' else 'EXAMINER'}: {t.get('text', '')}"
            for t in recent
        )
        history_block = f"\n\n=== PREVIOUS CONVERSATION ===\n{formatted_turns}"

    rubric_block = ""
    if prior_rubric:
        lines = "\n".join(
            f"- {r.get('concept', '')} (weight={r.get('weight', 2)}, prev={r.get('status', 'MISSING')})"
            for r in prior_rubric
            if r.get("concept")
        )
        if lines:
            rubric_block = (
                "\n\n=== EXISTING RUBRIC TO RE-EVALUATE CUMULATIVELY ===\n"
                f"{lines}"
            )

    system_prompt = (
        "You are a strict yet encouraging Feynman Technique examiner. "
        "Respond in the same language as the student's explanation (e.g., Italian). "
        "Compare the student's cumulative explanation across the conversation against the ground-truth PDF material. "
        "Build or update a verifiable rubric of 4 to 6 key concepts from the ground truth "
        "(if an EXISTING RUBRIC is provided, keep its criteria and update each status based on cumulative answers). "
        "For each rubric item assign: "
        "- weight: 3 for core pillars, 2 for important concepts, 1 for supporting details; "
        "- status: COVERED (accurate & clear), PARTIAL (vague/incomplete), or MISSING (absent/wrong); "
        "- evidence: brief factual comparison citing what the student said or missed; "
        "- doc_index and source_page from the [D# | Page #] tags. "
        "Also provide understood_points, missing_or_wrong, ONE socratic_followup on the highest-weight non-COVERED criterion, "
        "and 1 to 3 targeted gap_flashcards only for unresolved PARTIAL/MISSING points."
    )

    user_prompt = (
        f"Topic: {topic.title}\n"
        f"Topic Summary: {topic.description}\n\n"
        f"=== GROUND TRUTH MATERIAL ===\n{ground_truth}"
        f"{rubric_block}"
        f"{history_block}\n\n"
        f"=== STUDENT'S LATEST RESPONSE ===\n{student_explanation}"
    )

    log.info(f"🎓 Valuto la spiegazione Feynman con rubrica su: {topic.title}...")
    result = call_llm_structured(system_prompt, user_prompt, FeynmanEvaluationResult, think=True)

    for item in result.rubric:
        item.weight = max(1, min(3, int(item.weight)))
        resolved_doc_id = doc_id_by_index.get(item.doc_index)
        if item.source_page is not None:
            if resolved_doc_id and (resolved_doc_id, item.source_page) in allowed_doc_pages:
                item.source_doc_id = resolved_doc_id
            elif unique_doc_for_page.get(item.source_page):
                item.source_doc_id = unique_doc_for_page[item.source_page]
            else:
                item.source_page = None
                item.source_doc_id = None

    if result.rubric:
        total_w = sum(r.weight for r in result.rubric)
        earned_w = sum(
            r.weight
            * (
                1.0
                if r.status == RubricStatus.COVERED
                else 0.5
                if r.status == RubricStatus.PARTIAL
                else 0.0
            )
            for r in result.rubric
        )
        result.mastery_score = round(100 * earned_w / total_w) if total_w > 0 else 0
        if not result.understood_points:
            result.understood_points = [
                r.concept for r in result.rubric if r.status == RubricStatus.COVERED
            ]
        if not result.missing_or_wrong:
            result.missing_or_wrong = [
                r.concept for r in result.rubric if r.status != RubricStatus.COVERED
            ]
    else:
        result.mastery_score = max(0, min(100, result.mastery_score))

    has_critical_gap = any(
        r.weight >= 3 and r.status == RubricStatus.MISSING for r in result.rubric
    )
    result.passed = result.mastery_score >= 75 and not has_critical_gap
    return result