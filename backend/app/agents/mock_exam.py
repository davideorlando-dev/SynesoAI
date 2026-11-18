import math
import re
from dataclasses import dataclass
from enum import Enum
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.logging_setup import get_logger
from app.agents.synthesizer import get_relevant_chunks_for_topic
from app.core.errors import (
    GradingIncompleteError,
    LLMInvalidResponseError,
    NoActiveTopicsError,
)
from app.core.llm import MAX_COMPLETION_TOKENS, call_llm_structured
from app.db.models import Exam, Topic, TopicPriority

log = get_logger("app.agents.mock_exam")


MAX_GRADE_30 = 30
MIN_POINTS_FOR_RELEVANT_ATTEMPT = 1
MAX_MOCK_QUESTIONS = 10
GRADING_BASE_TOKENS = 1500
GRADING_TOKENS_PER_QUESTION = 900
PASS_THRESHOLD_30 = 18
NO_ANSWER_PLACEHOLDER = "(Nessuna risposta fornita)"


class MockQuestionSchema(BaseModel):
    id: str = Field(description="Short ID like Q1, Q2, ...")
    topic_id: str
    topic_title: str
    question: str
    expected_points: list[str]
    max_points: int = Field(default=5, ge=2, le=10)


class MockExamGenerationResult(BaseModel):
    questions: list[MockQuestionSchema]


class PointStatus(str, Enum):
    COVERED = "COVERED"
    PARTIAL = "PARTIAL"
    MISSING = "MISSING"


class PointCheckSchema(BaseModel):
    point: str
    status: PointStatus
    note: str = ""


class QuestionFeedbackSchema(BaseModel):
    question_id: str
    point_checks: list[PointCheckSchema] = Field(default_factory=list)
    score: int = Field(ge=0)
    max_score: int = Field(ge=1)
    strengths: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    relevant_attempt: bool = Field(
        default=False,
        description=(
            "true if the student answer is on-topic and contains at least one correct, "
            "pertinent statement, even when no expected point is fully covered; "
            "false if it is blank, off-topic or wrong"
        ),
    )
    model_answer: str


class MockGapCardSchema(BaseModel):
    topic_id: str
    front: str
    back: str


class MockExamGradingResult(BaseModel):
    score_30: int = Field(ge=0, le=30, description="Italian university grade out of 30")
    passed: bool
    overall_feedback: str
    question_feedback: list[QuestionFeedbackSchema]
    gap_flashcards: list[MockGapCardSchema] = Field(default_factory=list)


def _normalize_points_to_30(questions: list[MockQuestionSchema]) -> None:
    if not questions:
        return
    n = len(questions)
    base = 1
    remaining = max(0, 30 - n * base)
    raw_weights = [max(1, int(q.max_points)) for q in questions]
    total_w = sum(raw_weights) or n

    exact_extras = [remaining * (w / total_w) for w in raw_weights]
    floors = [int(x) for x in exact_extras]
    leftover = remaining - sum(floors)

    order = sorted(range(n), key=lambda i: exact_extras[i] - floors[i], reverse=True)
    for idx in order[:leftover]:
        floors[idx] += 1

    for i, q in enumerate(questions):
        q.max_points = base + floors[i]


def generate_mock_exam(
    session: Session,
    exam: Exam,
    question_count: int = 6,
    focus: str = "ALL",
) -> MockExamGenerationResult:
    topics = [
        t
        for t in session.exec(select(Topic).where(Topic.exam_id == exam.id)).all()
        if not t.excluded
    ]
    if not topics:
        raise NoActiveTopicsError("Nessun argomento attivo disponibile per generare la simulazione.")

    prio_order = {TopicPriority.CORE: 0, TopicPriority.IMPORTANT: 1, TopicPriority.DETAIL: 2}
    if focus == "CORE":
        core_only = [t for t in topics if t.priority == TopicPriority.CORE]
        pool = core_only if core_only else topics
        sorted_topics = sorted(pool, key=lambda t: t.mastery_score)
    elif focus == "WEAK":
        sorted_topics = sorted(topics, key=lambda t: (t.mastery_score, prio_order[t.priority]))
    else:
        sorted_topics = sorted(topics, key=lambda t: (prio_order[t.priority], t.mastery_score))

    selected = sorted_topics[: min(len(sorted_topics), max(3, question_count))]
    context_blocks = []
    for t in selected:
        chunks = get_relevant_chunks_for_topic(session, t, limit=2)
        excerpt = "\n".join(c.text[:500] for c in chunks)
        context_blocks.append(
            f"[TOPIC id={t.id} | title={t.title} | priority={t.priority.value}]\n"
            f"Summary: {t.description}\nExcerpts:\n{excerpt}"
        )

    system_prompt = (
        "You are an expert university professor creating a realistic written/oral exam simulation. "
        "Write ALL questions and expected_points strictly in the exact same language as the course (e.g., Italian). "
        f"Create {question_count} targeted, non-trivial university exam questions covering the provided topics "
        "(prioritizing CORE topics). Provide 2 to 4 concrete expected_points per question and assign max_points "
        "so that the total sum across all questions equals 30. "
        "Use the exact topic_id and topic_title provided in the context."
    )
    user_prompt = (
        f"Course: {exam.title}\n"
        f"University: {exam.university or 'N/A'}\n\n"
        + "\n\n---\n\n".join(context_blocks)
    )

    log.info(f"📝 Genero simulazione d'esame ({question_count} domande) per: {exam.title}...")
    res = call_llm_structured(system_prompt, user_prompt, MockExamGenerationResult, think=False)
    if not res.questions:
        raise LLMInvalidResponseError("Il modello non ha generato domande per la simulazione.")

    # Una domanda senza punti attesi non ha rubrica, quindi non sarebbe
    # correggibile in modo deterministico: si scarta subito.
    graded_questions = [q for q in res.questions if _clean_expected_points(q)]
    if not graded_questions:
        raise LLMInvalidResponseError(
            "Il modello ha generato domande senza punti attesi: riprova."
        )
    if len(graded_questions) < len(res.questions):
        log.warning(
            "Simulazione: %d domande scartate perché senza punti attesi.",
            len(res.questions) - len(graded_questions),
        )
    res.questions = graded_questions[:MAX_MOCK_QUESTIONS]
    by_id = {t.id: t for t in topics}
    by_title = {t.title.strip().lower(): t for t in topics}
    fallback_topic = selected[0]

    for idx, q in enumerate(res.questions, start=1):
        if not q.id:
            q.id = f"Q{idx}"
        if q.topic_id not in by_id:
            matched = by_title.get(q.topic_title.strip().lower(), fallback_topic)
            q.topic_id = matched.id
            q.topic_title = matched.title

    _normalize_points_to_30(res.questions)
    return res


@dataclass(frozen=True)
class GradedQuestionSpec:
    """What the application knows about a question, independently of the model."""

    question_id: str
    max_points: int
    expected_points: tuple[str, ...]
    answered: bool
    topic_id: str = ""


POINT_CREDIT: dict[PointStatus, float] = {
    PointStatus.COVERED: 1.0,
    PointStatus.PARTIAL: 0.5,
    PointStatus.MISSING: 0.0,
}


def _unanswered_feedback(spec: GradedQuestionSpec) -> QuestionFeedbackSchema:
    return QuestionFeedbackSchema(
        question_id=spec.question_id,
        point_checks=[
            PointCheckSchema(point=p, status=PointStatus.MISSING)
            for p in spec.expected_points
        ],
        score=0,
        max_score=spec.max_points,
        missing=list(spec.expected_points),
        model_answer="",
    )


_NUMBER_RE = re.compile(r"\d+")


def _single_number(text: str) -> int | None:
    numbers = _NUMBER_RE.findall(text)
    return int(numbers[0]) if len(numbers) == 1 else None


def resolve_question_id(raw_id: str, specs: list[GradedQuestionSpec]) -> str | None:
    """
    Riconduce l'id scritto dal modello a una delle domande poste.

    Il modello non sempre ricopia l'id alla lettera: può cambiarne le maiuscole,
    aggiungere testo ("Q1 (topic_id=...)"), usare solo il numero ("Domanda 1") o
    scrivere il topic_id. Si accetta una forma alternativa solo se indica una
    domanda senza ambiguità; altrimenti None.
    """
    folded = raw_id.strip().casefold()
    by_folded = {spec.question_id.casefold(): spec.question_id for spec in specs}
    if folded in by_folded:
        return by_folded[folded]

    contained = [
        question_id
        for folded_id, question_id in by_folded.items()
        if re.search(rf"(?<![0-9a-z]){re.escape(folded_id)}(?![0-9a-z])", folded)
    ]
    if len(contained) == 1:
        return contained[0]

    same_topic = [
        spec.question_id
        for spec in specs
        if spec.topic_id and spec.topic_id.casefold() == folded
    ]
    if len(same_topic) == 1:
        return same_topic[0]

    number = _single_number(folded)
    if number is not None:
        same_number = [
            spec.question_id for spec in specs if _single_number(spec.question_id) == number
        ]
        if len(same_number) == 1:
            return same_number[0]
    return None


def align_feedback_ids(
    feedback: list[QuestionFeedbackSchema],
    specs: list[GradedQuestionSpec],
    requested_ids: list[str],
) -> None:
    """
    Sostituisce gli id scritti dal modello con quelli delle domande poste.

    Se nessun id è riconoscibile ma il modello ha restituito esattamente un
    feedback per ogni domanda richiesta, si assume che siano nello stesso ordine.
    """
    unresolved = 0
    for qf in feedback:
        resolved = resolve_question_id(qf.question_id, specs)
        if resolved is None:
            unresolved += 1
        else:
            qf.question_id = resolved

    if unresolved and unresolved == len(feedback) == len(requested_ids):
        for qf, question_id in zip(feedback, requested_ids, strict=True):
            qf.question_id = question_id


def ungraded_question_ids(
    feedback: list[QuestionFeedbackSchema], specs: list[GradedQuestionSpec]
) -> list[str]:
    """Domande a cui lo studente ha risposto ma per cui manca il feedback del modello."""
    graded = {qf.question_id for qf in feedback}
    return [
        spec.question_id
        for spec in specs
        if spec.answered and spec.question_id not in graded
    ]


def grading_token_budget(question_count: int) -> int:
    """
    Limite di output per la correzione: cresce con il numero di domande, perché
    per ognuna il modello scrive verifica dei punti, lacune e risposta modello.
    Con il limite fisso la prima risposta veniva troncata e andava richiesta di nuovo.
    """
    return min(
        MAX_COMPLETION_TOKENS,
        GRADING_BASE_TOKENS + GRADING_TOKENS_PER_QUESTION * max(1, question_count),
    )


def reconcile_question_feedback(
    feedback: list[QuestionFeedbackSchema],
    specs: list[GradedQuestionSpec],
) -> list[QuestionFeedbackSchema]:
    """
    Riallinea il feedback del modello alle domande realmente poste.

    Restituisce esattamente un feedback per domanda, nell'ordine dell'esame:
    - feedback con question_id sconosciuto o duplicato vengono scartati;
    - una domanda lasciata in bianco e ignorata dal modello vale 0 punti;
    - una domanda con risposta ma senza feedback rende la correzione incompleta
      e solleva un errore, così il voto non viene calcolato su un sottoinsieme.
    """
    known_ids = {spec.question_id for spec in specs}
    by_qid: dict[str, QuestionFeedbackSchema] = {}
    for qf in feedback:
        if qf.question_id in known_ids and qf.question_id not in by_qid:
            by_qid[qf.question_id] = qf

    ungraded = ungraded_question_ids(feedback, specs)
    if ungraded:
        raise GradingIncompleteError(
            "Correzione incompleta: il modello non ha valutato "
            f"{', '.join(ungraded)}. Riprova."
        )

    return [by_qid.get(spec.question_id) or _unanswered_feedback(spec) for spec in specs]


def _round_half_up(value: float) -> int:
    """round() arrotonda 0.5 e 2.5 verso il pari, togliendo mezzo punto allo studente."""
    return math.floor(value + 0.5)


def _clean_expected_points(question: MockQuestionSchema) -> list[str]:
    """Punti attesi utilizzabili: senza vuoti né duplicati. Modifica la domanda."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for point in question.expected_points:
        text = point.strip()
        key = _normalise_point(text)
        if key and key not in seen:
            seen.add(key)
            cleaned.append(text)
    question.expected_points = cleaned
    return cleaned


def _normalise_point(text: str) -> str:
    """Testo di un punto ridotto a ciò che conta per riconoscerlo."""
    return " ".join(re.sub(r"[^\w\s]", " ", text).lower().split())


def _contains(a: str, b: str) -> bool:
    """Vero se uno dei due testi contiene l'altro: una riformulazione più o meno ampia."""
    return a in b or b in a


def align_point_checks(
    point_checks: list[PointCheckSchema],
    expected_points: tuple[str, ...],
    question_id: str = "",
) -> list[PointCheckSchema]:
    """
    Riporta le verifiche del modello ai punti attesi della domanda.

    Il risultato ha sempre una verifica per ogni punto atteso, nel loro ordine:
    così il voto dipende dalla rubrica dell'esame e non da quante voci il
    modello ha deciso di elencare.

    Una verifica viene abbinata a un punto solo se è riconoscibilmente quel
    punto: stesso testo, oppure un testo che lo contiene o vi è contenuto e
    che non potrebbe riferirsi a nessun altro punto rimasto. Tutto il resto
    vale MISSING, perché una verifica che non sappiamo a cosa si riferisca non
    è una valutazione: non valutare un punto non è una prova che sia coperto.

    Il prompt chiede al modello di ricopiare i punti alla lettera, quindi
    l'abbinamento esatto dovrebbe bastare; quello per contenimento resta per
    le riformulazioni, e ciò che non si abbina viene scritto nel log, dove si
    vede se il modello sta rispettando la consegna.
    """
    remaining = list(point_checks)
    matched: dict[int, PointCheckSchema] = {}
    keys = [_normalise_point(point) for point in expected_points]

    # Primo giro: testo identico. È quello che il prompt chiede.
    for idx, key in enumerate(keys):
        if not key:
            continue
        for check in remaining:
            if _normalise_point(check.point) == key:
                matched[idx] = check
                remaining.remove(check)
                break

    # Secondo giro: contenimento, ma solo quando è privo di ambiguità — una
    # sola verifica candidata per il punto, e quella verifica non potrebbe
    # riferirsi a un altro punto ancora senza valutazione.
    open_indexes = [idx for idx, key in enumerate(keys) if key and idx not in matched]
    for idx in open_indexes:
        key = keys[idx]
        candidates = [
            check
            for check in remaining
            if _normalise_point(check.point) and _contains(_normalise_point(check.point), key)
        ]
        if len(candidates) != 1:
            continue
        check = candidates[0]
        check_key = _normalise_point(check.point)
        if any(
            other != idx and _contains(check_key, keys[other])
            for other in open_indexes
            if keys[other]
        ):
            continue
        matched[idx] = check
        remaining.remove(check)

    unaligned = [point for idx, point in enumerate(expected_points) if idx not in matched]
    if unaligned:
        log.warning(
            "Domanda %s: %d punti attesi senza valutazione del modello, contati MISSING: %s",
            question_id or "?",
            len(unaligned),
            " | ".join(unaligned),
        )

    return [
        PointCheckSchema(
            point=point,
            status=matched[idx].status if idx in matched else PointStatus.MISSING,
        )
        for idx, point in enumerate(expected_points)
    ]


def score_question_feedback(qf: QuestionFeedbackSchema, spec: GradedQuestionSpec) -> None:
    """
    Calcola il punteggio della domanda applicando la rubrica della domanda.

    Il numero scritto dal modello non viene usato: conta solo lo stato di
    ciascun punto atteso. Fa eccezione una domanda senza punti attesi, dove non
    c'è rubrica da applicare e il punteggio del modello viene solo limitato.
    Una risposta pertinente ma incompleta non vale zero: se il modello la
    segnala come tentativo pertinente riceve almeno
    MIN_POINTS_FOR_RELEVANT_ATTEMPT.

    Una domanda senza risposta vale zero, e nessun giudizio del modello può
    cambiarlo: l'applicazione sa che il foglio era bianco, mentre il modello
    può dire qualsiasi cosa sui punti attesi.
    """
    max_points = spec.max_points
    qf.max_score = max_points

    if not spec.answered:
        qf.relevant_attempt = False
        qf.point_checks = [
            PointCheckSchema(point=point, status=PointStatus.MISSING)
            for point in spec.expected_points
        ]
        qf.score = 0
        qf.strengths = []
        qf.missing = list(spec.expected_points)
        return

    if spec.expected_points:
        qf.point_checks = align_point_checks(
            qf.point_checks, spec.expected_points, spec.question_id
        )
        earned_ratio = sum(POINT_CREDIT[pc.status] for pc in qf.point_checks) / len(
            qf.point_checks
        )
        qf.score = _round_half_up(max_points * earned_ratio)
    else:
        log.warning(
            "Domanda %s senza punti attesi: il voto resta quello del modello.",
            spec.question_id,
        )
        qf.point_checks = []
        qf.score = max(0, min(max_points, qf.score))

    if qf.relevant_attempt:
        qf.score = max(qf.score, min(max_points, MIN_POINTS_FOR_RELEVANT_ATTEMPT))

    if not qf.point_checks:
        return
    if not qf.strengths:
        qf.strengths = [
            pc.point for pc in qf.point_checks if pc.status == PointStatus.COVERED
        ]
    if not qf.missing:
        qf.missing = [
            pc.point for pc in qf.point_checks if pc.status != PointStatus.COVERED
        ]


def apply_deterministic_grade(
    res: MockExamGradingResult, specs: list[GradedQuestionSpec]
) -> None:
    """Sostituisce voto e punteggi del modello con quelli calcolati dall'applicazione."""
    res.question_feedback = reconcile_question_feedback(res.question_feedback, specs)
    for qf, spec in zip(res.question_feedback, specs, strict=True):
        score_question_feedback(qf, spec)

    total_earned = sum(qf.score for qf in res.question_feedback)
    total_max = sum(spec.max_points for spec in specs)
    res.score_30 = (
        max(0, min(MAX_GRADE_30, _round_half_up(MAX_GRADE_30 * total_earned / total_max)))
        if total_max > 0
        else 0
    )
    res.passed = res.score_30 >= PASS_THRESHOLD_30


GRADING_SYSTEM_PROMPT = (
    "You are a fair, rigorous university professor grading a mock exam out of 30 (trentesimi). "
    "Respond strictly in the same language as the exam (e.g., Italian). "
    "For EACH question, evaluate every expected point in point_checks against the ground truth excerpts "
    "and the student answer, using exactly one status: "
    "COVERED = the point is stated correctly; "
    "PARTIAL = the point is addressed but incomplete, imprecise or only implied; "
    "MISSING = the point is not addressed or is wrong. "
    "Set relevant_attempt as described in the schema: an incomplete but pertinent answer is a relevant attempt. "
    "Copy each question id exactly as written between the === markers (for example Q1) into question_id: "
    "never translate, renumber or extend it. "
    "Return exactly one entry in point_checks per expected point, in the same order, and copy the text of "
    "each expected point verbatim into its point field: never translate, rephrase, merge or split them. "
    "An expected point whose text cannot be matched back to the rubric is counted as MISSING. "
    "Also provide strengths, missing concepts, a crisp model_answer, "
    "and generate 2 to 4 targeted gap_flashcards using exact topic_id for the weakest concepts."
)


def _request_grading(
    exam: Exam,
    requested_ids: list[str],
    qa_block_by_qid: dict[str, str],
    specs: list[GradedQuestionSpec],
) -> MockExamGradingResult:
    """Chiede al modello la correzione delle domande indicate e ne riallinea gli id."""
    user_prompt = f"Course: {exam.title}\n\n" + "\n\n".join(
        qa_block_by_qid[question_id] for question_id in requested_ids
    )
    res = call_llm_structured(
        GRADING_SYSTEM_PROMPT,
        user_prompt,
        MockExamGradingResult,
        think=True,
        max_tokens=grading_token_budget(len(requested_ids)),
    )
    returned_ids = [qf.question_id for qf in res.question_feedback]
    align_feedback_ids(res.question_feedback, specs, requested_ids)
    aligned_ids = [qf.question_id for qf in res.question_feedback]
    if aligned_ids != returned_ids:
        log.info(f"🎓 Id delle domande riallineati: {returned_ids} -> {aligned_ids}")
    return res


def grade_mock_exam(
    session: Session,
    exam: Exam,
    questions: list[dict],
    answers: dict[str, str],
) -> MockExamGradingResult:
    topics_by_id = {
        t.id: t for t in session.exec(select(Topic).where(Topic.exam_id == exam.id)).all()
    }

    specs: list[GradedQuestionSpec] = []
    qa_block_by_qid: dict[str, str] = {}
    for idx, q in enumerate(questions, start=1):
        qid = q.get("id") or f"Q{idx}"
        tid = q.get("topic_id", "")
        max_pts = max(1, int(q.get("max_points", 5)))
        expected_points = tuple(q.get("expected_points", []))
        student_ans = (answers.get(qid) or "").strip()
        specs.append(
            GradedQuestionSpec(
                question_id=qid,
                max_points=max_pts,
                expected_points=expected_points,
                answered=bool(student_ans),
                topic_id=tid,
            )
        )

        topic = topics_by_id.get(tid)
        truth = ""
        if topic:
            chunks = get_relevant_chunks_for_topic(session, topic, limit=2)
            truth = "\n".join(c.text[:450] for c in chunks)
        points_block = "".join(
            f"  {n}. {point}\n" for n, point in enumerate(expected_points, start=1)
        )
        qa_block_by_qid[qid] = (
            f"=== {qid} (topic_id={tid} | max_points={max_pts}) ===\n"
            f"Question: {q.get('question', '')}\n"
            "Expected points (one point_checks entry each, text copied verbatim):\n"
            f"{points_block}"
            f"Ground truth excerpts: {truth}\n"
            f"Student answer: {student_ans or NO_ANSWER_PLACEHOLDER}"
        )

    log.info(f"🎓 Correggo simulazione d'esame per: {exam.title}...")
    res = _request_grading(exam, list(qa_block_by_qid), qa_block_by_qid, specs)

    # Se il modello salta delle risposte, si richiede la correzione solo di quelle
    # invece di scartare l'intera simulazione.
    skipped = ungraded_question_ids(res.question_feedback, specs)
    if skipped:
        log.info(f"🎓 Richiedo la correzione delle domande saltate: {', '.join(skipped)}")
        completion = _request_grading(exam, skipped, qa_block_by_qid, specs)
        res.question_feedback.extend(completion.question_feedback)
        res.gap_flashcards.extend(completion.gap_flashcards)

    apply_deterministic_grade(res, specs)
    return res
