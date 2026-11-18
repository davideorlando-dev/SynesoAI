import json
from pathlib import Path
import pymupdf
from pydantic import BaseModel, Field
from app.config import settings
from app.core.logging_setup import get_logger
from app.core.llm import call_llm_structured
from app.db.models import Document, DocumentChunk, Exam, Topic, TopicPriority
from app.tools.web_search import search_course_context
from app.core.citations import filter_valid_page_refs

log = get_logger("app.agents.mapper")

class PageRefSchema(BaseModel):
    doc_index: int = Field(default=1, description="1-based document index shown in [D1], [D2], etc.")
    page: int


class ExtractedTopicSchema(BaseModel):
    temp_id: str = Field(description="Short identifier like T1, T2, T3")
    title: str
    description: str
    priority: TopicPriority
    estimated_minutes: int = 45
    prerequisite_temp_ids: list[str] = Field(default_factory=list)
    relevant_pages: list[PageRefSchema] = Field(default_factory=list)


class ExamMappingResult(BaseModel):
    web_context_summary: str = Field(
        description="Summary of typical exam structure, core themes, and professor/university expectations."
    )
    topics: list[ExtractedTopicSchema]


def _extract_toc_digest(docs: list[Document], max_entries: int = 45) -> str:
    entries: list[str] = []
    for idx, doc in enumerate(docs):
        path = Path(doc.file_path)
        if not path.exists():
            continue
        try:
            with pymupdf.open(str(path)) as pdf_doc:
                toc = pdf_doc.get_toc(simple=True) or []
            for item in toc:
                if len(item) < 3:
                    continue
                level, title, page = int(item[0]), str(item[1]).strip(), int(item[2])
                if not title or level > 3:
                    continue
                entries.append(f"{'  ' * max(0, level - 1)}- [D{idx + 1} | Pag. {page}] {title}")
                if len(entries) >= max_entries:
                    break
        except Exception:
            continue
        if len(entries) >= max_entries:
            break
    return "=== DOCUMENT TABLE OF CONTENTS ===\n" + "\n".join(entries) if entries else ""


def _format_sampled_chunks(
    chunks: list[DocumentChunk], docs: list[Document], max_samples: int = 10
) -> str:
    doc_index_by_id = {d.id: idx + 1 for idx, d in enumerate(docs)}
    doc_legend = "\n".join(f"- D{idx + 1}: {d.filename}" for idx, d in enumerate(docs))

    step = max(1, len(chunks) // max_samples)
    sampled = chunks[::step][:max_samples]
    excerpts = "\n\n".join(
        f"[D{doc_index_by_id.get(c.document_id, 1)} | Page {c.page_number}]\n{c.text[:380]}"
        for c in sampled
    )
    toc_block = _extract_toc_digest(docs)
    parts = [f"Documents:\n{doc_legend}"]
    if toc_block:
        parts.append(toc_block)
    parts.append(f"=== SAMPLED EXCERPTS ===\n{excerpts}")
    return "\n\n".join(parts)

def _convert_topics(
    exam_id: str,
    extracted: list[ExtractedTopicSchema],
    docs: list[Document],
    chunks: list[DocumentChunk],
    web_snippets: list[dict[str, str]],
) -> tuple[list[Topic], dict[str, list[str]]]:
    temp_to_topic: dict[str, Topic] = {}
    for item in extracted:
        page_refs = filter_valid_page_refs(item.relevant_pages, docs, chunks)

        topic = Topic(
            exam_id=exam_id,
            title=item.title,
            description=item.description,
            priority=item.priority,
            estimated_minutes=max(15, min(240, item.estimated_minutes)),
            source_pages_json=json.dumps(page_refs),
            web_sources_json=json.dumps(web_snippets),
        )
        temp_to_topic[item.temp_id] = topic

    prereqs_map: dict[str, list[str]] = {}
    for item in extracted:
        topic = temp_to_topic[item.temp_id]
        real_prereqs = [
            temp_to_topic[pid].id
            for pid in item.prerequisite_temp_ids
            if pid in temp_to_topic
        ]
        topic.prerequisites_json = json.dumps(real_prereqs)
        prereqs_map[topic.id] = real_prereqs

    return list(temp_to_topic.values()), prereqs_map

def map_exam_topics(
    exam: Exam, chunks: list[DocumentChunk], docs: list[Document], lang: str = "it"
) -> tuple[str, list[Topic], dict[str, list[str]]]:
    log.info(f"🔍 Ricerca contesto web per: {exam.title} ({exam.university})...")
    web_snippets = []
    if settings.enable_web_search:
        web_snippets = search_course_context(
            subject=exam.title,
            university=exam.university,
            degree_course=exam.degree_course,
            lang=lang,
        )
    log.info(f"🌐 Trovati {len(web_snippets)} risultati web.")

    web_block = (
        "\n".join(
            f"- {s['title']}: {s['snippet'][:900 if idx == 0 else 220]}"
            for idx, s in enumerate(web_snippets[:4])
        )
        or "No external web context available."
    )

    doc_digest = _format_sampled_chunks(chunks, docs)
    guidance = (exam.syllabus_guidance or "").strip()
    guidance_block = (
        f"\n\n=== PROFESSOR FOCUS / CUSTOM STRUCTURE & EXCLUSIONS ===\n{guidance}"
        if guidance
        else ""
    )

    system_prompt = (
        "You are an expert university study strategist. "
        "CRITICAL LANGUAGE RULE: ALL text you generate — including EVERY topic 'title', 'description', and 'web_context_summary' — "
        "MUST be written strictly in the exact same language as the course name and uploaded PDF "
        "(for example, strictly in Italian if the PDF is in Italian; NEVER translate topic titles into English). "
        "If PROFESSOR FOCUS / CUSTOM STRUCTURE & EXCLUSIONS is provided, obey it strictly: "
        "create dedicated CORE topics for specific subdivisions or distinctions requested by the student, "
        "and OMIT/EXCLUDE any chapters or sections the student explicitly says to skip. "
        "Extract a clean, structured list of 5 to 12 study topics ordered logically from foundations to advanced concepts. "
        "Classify priority strictly as one of: CORE, IMPORTANT, DETAIL. "
        "Specify prerequisites using temp_id (e.g., T1 before T2) without circular dependencies. "
        "For relevant_pages, cite doc_index (from [D1], [D2]) and page."
    )

    user_prompt = (
        f"Course: {exam.title}\n"
        f"University: {exam.university or 'Not specified'}\n"
        f"Degree: {exam.degree_course or 'Not specified'}\n"
        f"Professor: {exam.professor or 'Not specified'}"
        f"{guidance_block}\n\n"
        f"=== WEB CONTEXT ===\n{web_block}\n\n"
        f"=== UPLOADED MATERIAL EXCERPTS ===\n{doc_digest}"
    )

    log.info(f"🧠 Chiedo a Groq ({settings.llm_model}) di estrarre gli argomenti...")
    result = call_llm_structured(system_prompt, user_prompt, ExamMappingResult, think=False)
    log.info(f"✅ Estratti {len(result.topics)} argomenti!")

    topics, prereqs_map = _convert_topics(exam.id, result.topics, docs, chunks, web_snippets)
    return result.web_context_summary, topics, prereqs_map


def map_incremental_topics(
    exam: Exam,
    new_chunks: list[DocumentChunk],
    docs: list[Document],
    existing_topics: list[Topic],
) -> tuple[list[Topic], dict[str, list[str]]]:
    if not new_chunks:
        return [], {}

    doc_digest = _format_sampled_chunks(new_chunks, docs)
    existing_block = "\n".join(f"- {t.title}" for t in existing_topics) or "None"
    guidance = (exam.syllabus_guidance or "").strip()
    guidance_block = (
        f"\n\n=== PROFESSOR FOCUS / CUSTOM STRUCTURE & EXCLUSIONS ===\n{guidance}"
        if guidance
        else ""
    )

    system_prompt = (
        "You are an expert university study strategist. "
        "CRITICAL LANGUAGE RULE: ALL output text — including EVERY 'title' and 'description' — "
        "MUST be written strictly in the exact same language as the course name and uploaded PDF. "
        "Respect any PROFESSOR FOCUS / CUSTOM STRUCTURE & EXCLUSIONS strictly (skip excluded parts, highlight requested distinctions as CORE). "
        "Extract ONLY NEW study topics (2 to 8 topics) covered in the newly uploaded pages that are NOT duplicates of existing topics. "
        "Classify priority strictly as one of: CORE, IMPORTANT, DETAIL. "
        "For relevant_pages, cite doc_index (from [D1], [D2]) and page."
    )

    user_prompt = (
        f"Course: {exam.title}"
        f"{guidance_block}\n\n"
        f"=== EXISTING TOPICS (DO NOT DUPLICATE) ===\n{existing_block}\n\n"
        f"=== NEWLY UPLOADED MATERIAL ===\n{doc_digest}"
    )

    log.info("🧠 Estraggo nuovi argomenti dai PDF appena aggiunti...")
    result = call_llm_structured(system_prompt, user_prompt, ExamMappingResult, think=False)
    log.info(f"✅ Trovati {len(result.topics)} nuovi argomenti!")

    return _convert_topics(exam.id, result.topics, docs, new_chunks, [])