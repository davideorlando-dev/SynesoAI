from collections.abc import Iterator
import json
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.logging_setup import get_logger
from app.core.llm import call_llm_structured, stream_llm_text
from app.core.retrieval import search_exam_chunks
from app.db.models import CardType, Document, DocumentChunk, Topic
from app.core.citations import ChunkRef, resolve_doc_page

log = get_logger("app.agents.synthesizer")

# I modelli scrivono le formule con \\( \\) e \\[ \\], che in Markdown sono
# parentesi protette: la barra sparisce e la formula arriva al lettore come
# testo nudo. Il frontend sa raddrizzarle (lib/mathDelimiters.ts), ma è meglio
# che nascano giuste. Una riga sola, usata da ogni prompt che produce Markdown.
MATH_NOTATION_RULE = (
    "Write mathematics in LaTeX between dollar signs: $...$ inline and $$...$$ "
    "on its own line. Never use \\( \\) or \\[ \\]: in Markdown the backslash "
    "escapes the bracket and the formula reaches the reader unrendered. "
    "Keep prose outside the formula: inside math mode use \\text{} only for short "
    "labels, never for full sentences."
)

class HighlightSchema(BaseModel):
    doc_index: int = Field(default=1, description="1-based document index from [D1], [D2]")
    page_number: int
    quote: str = Field(description="Short key quote from the PDF page")
    why_it_matters: str


class FlashcardSeedSchema(BaseModel):
    card_type: CardType = CardType.BASIC
    front: str
    back: str
    doc_index: int = 1
    page_number: int | None = None


class TopicSynthesisResult(BaseModel):
    notes_markdown: str = Field(
        description="Clear, well-structured study notes in Markdown."
    )
    highlights: list[HighlightSchema]
    flashcards: list[FlashcardSeedSchema]


class NotesExtrasResult(BaseModel):
    highlights: list[HighlightSchema]
    flashcards: list[FlashcardSeedSchema]


class ExtraFlashcardsResult(BaseModel):
    flashcards: list[FlashcardSeedSchema]


class CitationSchema(BaseModel):
    doc_index: int = Field(default=1, description="1-based document index from [D1], [D2]")
    page_number: int


class TutorAnswerResult(BaseModel):
    answer_markdown: str = Field(
        description="Clear, concise explanation grounded in the material with a practical example if helpful."
    )
    citations: list[CitationSchema] = Field(default_factory=list)


class SingleCardResult(BaseModel):
    card_type: CardType = CardType.BASIC
    front: str
    back: str


def get_relevant_chunks_for_topic(
    session: Session, topic: Topic, limit: int = 6
) -> list[DocumentChunk]:
    docs = session.exec(select(Document).where(Document.exam_id == topic.exam_id)).all()
    doc_ids = [d.id for d in docs]
    if not doc_ids:
        return []

    all_chunks = session.exec(
        select(DocumentChunk).where(DocumentChunk.document_id.in_(doc_ids))
    ).all()

    try:
        raw_refs = json.loads(topic.source_pages_json or "[]")
    except Exception:
        raw_refs = []

    target_pairs: set[tuple[str, int]] = set()
    legacy_pages: set[int] = set()
    for ref in raw_refs:
        if isinstance(ref, dict) and "doc_id" in ref and "page" in ref:
            target_pairs.add((ref["doc_id"], int(ref["page"])))
        elif isinstance(ref, int):
            legacy_pages.add(ref)

    matched: list[DocumentChunk] = []
    seen_ids: set[str] = set()

    for c in all_chunks:
        if (c.document_id, c.page_number) in target_pairs or c.page_number in legacy_pages:
            if c.id not in seen_ids:
                matched.append(c)
                seen_ids.add(c.id)

    if len(matched) < limit:
        fts_hits = search_exam_chunks(
            session,
            topic.exam_id,
            f"{topic.title} {topic.description}",
            limit=limit,
        )
        for c in fts_hits:
            if c.id not in seen_ids:
                matched.append(c)
                seen_ids.add(c.id)
            if len(matched) >= limit:
                break

    if not matched:
        matched = all_chunks

    return matched[:limit]


def prepare_topic_context(
    session: Session, topic: Topic
) -> tuple[str, str, list[tuple[int, str, str, int]], list[ChunkRef]]:
    docs = session.exec(
        select(Document).where(Document.exam_id == topic.exam_id).order_by(Document.created_at)
    ).all()
    doc_meta = [(idx + 1, d.id, d.filename, d.page_count) for idx, d in enumerate(docs)]
    index_by_doc_id = {d.id: idx + 1 for idx, d in enumerate(docs)}

    chunks = get_relevant_chunks_for_topic(session, topic, limit=5)
    chunk_refs = [
        ChunkRef(document_id=c.document_id, page_number=c.page_number, text=c.text)
        for c in chunks
    ]
    context_text = "\n\n".join(
        f"[D{index_by_doc_id.get(c.document_id, 1)} | Page {c.page_number}]\n{c.text[:950]}"
        for c in chunks
    )

    try:
        web_sources = json.loads(topic.web_sources_json or "[]")
    except Exception:
        web_sources = []
    web_block = "\n".join(
        f"- {w.get('title', '')}: {w.get('snippet', '')[:180]}" for w in web_sources[:2]
    )
    return context_text, web_block, doc_meta, chunk_refs

def _build_topic_context(
    session: Session, topic: Topic
) -> tuple[str, str, list[tuple[int, str, str, int]], list[ChunkRef]]:
    return prepare_topic_context(session, topic)



def synthesize_topic_materials(
    session: Session, topic: Topic
) -> tuple[TopicSynthesisResult, list[tuple[int, str, str, int]], list[ChunkRef]]:
    context_text, web_block, doc_meta, chunk_refs = prepare_topic_context(session, topic)

    system_prompt = (
        "You are an expert university tutor adapting naturally to the subject "
        "(e.g., legal norms/distinctions for Law; frameworks, KPIs, and real-world business examples for Marketing/Economics; principles and formulas for STEM). "
        "Write ALL notes, highlights, and flashcards strictly in the same language as the topic and PDF (e.g., Italian). "
        f"{MATH_NOTATION_RULE} "
        "Base everything strictly on the provided PDF excerpts and web context. If the source material consists of terse slides, expand the bullet points into clear, connected explanations. "
        "Generate: "
        "1) Clear, complete, exam-ready Markdown notes (450-650 words) structured in 3 H2 sections written in the same language as the PDF "
        "(e.g. Italian: '## Quadro d\'insieme e Logica di fondo', '## Concetti Chiave, Modelli e Regole', '## Distinzioni, Esempi e Trappole d\'Esame'; "
        "English: '## Big Picture & Core Logic', '## Key Concepts, Models & Rules', '## Distinctions, Examples & Exam Traps'); "
        "2) 3 key highlights referencing exact doc_index and page_number (keep each quote concise, under 25 words, copied faithfully from the PDF excerpts); "
        "3) 3 to 4 focused active-recall flashcards (card_type: BASIC, CLOZE using [...] for blanks, or EXAM_Q)."
    )

    user_prompt = (
        f"Topic: {topic.title}\n"
        f"Description: {topic.description}\n\n"
        f"=== WEB CONTEXT ===\n{web_block}\n\n"
        f"=== PDF EXCERPTS ===\n{context_text}"
    )

    log.info(f"📝 Genero appunti, highlights e flashcard per: {topic.title}...")
    result = call_llm_structured(system_prompt, user_prompt, TopicSynthesisResult, think=False)
    return result, doc_meta, chunk_refs
        


def stream_topic_notes_from_context(
    topic_title: str,
    topic_description: str,
    context_text: str,
    web_block: str,
) -> Iterator[str]:
    system_prompt = (
        "You are an expert university tutor adapting naturally to the subject "
        "(e.g., legal norms/distinctions for Law; frameworks, KPIs, and real-world business examples for Marketing/Economics; principles/formulas for STEM). "
        "Write strictly in the exact same language as the topic and PDF (e.g., Italian). "
        f"{MATH_NOTATION_RULE} "
        "Base everything strictly on the provided PDF excerpts and web context. If the source material consists of terse slides, expand the bullet points into clear, connected explanations. "
        "Output ONLY clean Markdown study notes (450-650 words, no intro/outro chatter, no JSON) structured in 3 H2 sections matching the PDF language "
        "(in Italian use: '## Quadro d\'insieme e Logica di fondo', '## Concetti Chiave, Modelli e Regole', '## Distinzioni, Esempi e Trappole d\'Esame'; "
        "in English use: '## Big Picture & Core Logic', '## Key Concepts, Models & Rules', '## Distinctions, Examples & Exam Traps')."
    )

    user_prompt = (
        f"Topic: {topic_title}\n"
        f"Description: {topic_description}\n\n"
        f"=== WEB CONTEXT ===\n{web_block}\n\n"
        f"=== PDF EXCERPTS ===\n{context_text}"
    )

    log.info(f"⚡ Streaming appunti per: {topic_title}...")
    yield from stream_llm_text(system_prompt, user_prompt, think=False)


def stream_topic_notes(session: Session, topic: Topic) -> Iterator[str]:
    context_text, web_block, _, _ = prepare_topic_context(session, topic)
    yield from stream_topic_notes_from_context(
        topic.title, topic.description, context_text, web_block
    )

def synthesize_topic_extras_from_context(
    topic_title: str,
    topic_description: str,
    context_text: str,
) -> NotesExtrasResult:
    system_prompt = (
        "You are an expert university tutor. "
        "Write ALL highlights and flashcards strictly in the same language as the topic and PDF (e.g., Italian). "
        "Base everything strictly on the provided PDF excerpts. "
        "Generate: "
        "1) 3 key highlights referencing exact doc_index (from [D1], [D2]) and page_number (keep each quote under 25 words); "
        "2) 3 to 4 focused active-recall flashcards (card_type: BASIC, CLOZE using [...] for blanks, or EXAM_Q)."
    )

    user_prompt = (
        f"Topic: {topic_title}\n"
        f"Description: {topic_description}\n\n"
        f"=== PDF EXCERPTS ===\n{context_text}"
    )

    log.info(f"✨ Estraggo citazioni e flashcard per: {topic_title}...")
    return call_llm_structured(system_prompt, user_prompt, NotesExtrasResult, think=False)


def synthesize_topic_extras(
    session: Session, topic: Topic
) -> tuple[NotesExtrasResult, list[tuple[int, str, str, int]], list[ChunkRef]]:
    context_text, _, doc_meta, chunk_refs = prepare_topic_context(session, topic)
    result = synthesize_topic_extras_from_context(
        topic.title, topic.description, context_text
    )
    return result, doc_meta, chunk_refs

def generate_more_flashcards(
    session: Session,
    topic: Topic,
    existing_fronts: list[str],
    count: int = 5,
) -> tuple[ExtraFlashcardsResult, dict[int, Document]]:
    docs = session.exec(
        select(Document).where(Document.exam_id == topic.exam_id).order_by(Document.created_at)
    ).all()
    doc_by_index = {idx + 1: d for idx, d in enumerate(docs)}
    index_by_doc_id = {d.id: idx + 1 for idx, d in enumerate(docs)}

    chunks = get_relevant_chunks_for_topic(session, topic, limit=5)
    context_text = "\n\n".join(
        f"[D{index_by_doc_id.get(c.document_id, 1)} | Page {c.page_number}]\n{c.text[:900]}"
        for c in chunks
    )
    existing_block = "\n".join(f"- {f}" for f in existing_fronts[:15]) or "None"

    system_prompt = (
        "You are an expert university tutor. "
        "Write ALL flashcards strictly in the same language as the topic and PDF (e.g., Italian). "
        f"Generate {count} NEW, non-duplicate active-recall flashcards (mix of BASIC, CLOZE using [...] for blanks, and EXAM_Q) "
        "testing deeper nuances, exceptions, or comparisons from the provided PDF excerpts."
    )

    user_prompt = (
        f"Topic: {topic.title}\n"
        f"=== EXISTING FLASHCARDS (DO NOT REPEAT) ===\n{existing_block}\n\n"
        f"=== PDF EXCERPTS ===\n{context_text}"
    )

    log.info(f"🃏 Genero {count} flashcard extra per: {topic.title}...")
    result = call_llm_structured(system_prompt, user_prompt, ExtraFlashcardsResult, think=False)
    return result, doc_by_index


def answer_topic_question(
    session: Session,
    topic: Topic,
    question: str,
    selected_text: str | None = None,
) -> tuple[TutorAnswerResult, dict[int, Document]]:
    docs = session.exec(
        select(Document).where(Document.exam_id == topic.exam_id).order_by(Document.created_at)
    ).all()
    doc_by_index = {idx + 1: d for idx, d in enumerate(docs)}
    index_by_doc_id = {d.id: idx + 1 for idx, d in enumerate(docs)}

    query = f"{question} {selected_text or ''} {topic.title}"
    chunks = search_exam_chunks(session, topic.exam_id, query, limit=5)
    seen = {c.id for c in chunks}
    if len(chunks) < 3:
        for extra in get_relevant_chunks_for_topic(session, topic, limit=4):
            if extra.id not in seen:
                chunks.append(extra)
                seen.add(extra.id)
            if len(chunks) >= 5:
                break

    context_text = "\n\n".join(
        f"[D{index_by_doc_id.get(c.document_id, 1)} | Page {c.page_number}]\n{c.text[:900]}"
        for c in chunks
    )

    system_prompt = (
        "You are an expert, friendly university Study Partner. "
        "Respond strictly in the same language as the student's question and PDF (e.g., Italian). "
        "Answer clearly and directly (max 180 words) using a concrete example or analogy when helpful. "
        f"{MATH_NOTATION_RULE} "
        "Ground every factual claim in the provided PDF excerpts and cite the exact doc_index and page_number in citations."
    )
    sel_block = f"Selected note excerpt:\n\"{selected_text}\"\n\n" if selected_text else ""
    user_prompt = (
        f"Topic: {topic.title}\n"
        f"{sel_block}"
        f"Student's question: {question}\n\n"
        f"=== PDF EXCERPTS ===\n{context_text}"
    )

    log.info(f"💬 Rispondo al dubbio su: {topic.title}...")
    result = call_llm_structured(system_prompt, user_prompt, TutorAnswerResult, think=False)

    allowed_pairs = {
        (index_by_doc_id[c.document_id], c.page_number)
        for c in chunks
        if c.document_id in index_by_doc_id
    }
    doc_info_by_index = {
        idx + 1: (d.id, d.filename, d.page_count) for idx, d in enumerate(docs)
    }
    valid_citations: list[CitationSchema] = []
    for cit in result.citations:
        doc_id, _, page_num = resolve_doc_page(cit.doc_index, cit.page_number, doc_info_by_index)
        if not doc_id or not page_num:
            continue
        if allowed_pairs and (cit.doc_index, page_num) not in allowed_pairs:
            continue
        valid_citations.append(cit)
    result.citations = valid_citations

    return result, doc_by_index


def create_flashcard_from_selection(
    session: Session,
    topic: Topic,
    selected_text: str,
) -> SingleCardResult:
    system_prompt = (
        "You are an expert university tutor. "
        "Write strictly in the same language as the selected text (e.g., Italian). "
        "Turn the selected excerpt into ONE crisp, high-yield active-recall flashcard "
        "(card_type: BASIC or CLOZE using [...] for blanks)."
    )
    user_prompt = (
        f"Topic: {topic.title}\n"
        f"Selected excerpt to memorize:\n\"{selected_text[:1000]}\""
    )
    log.info(f"🃏 Creo flashcard da selezione su: {topic.title}...")
    return call_llm_structured(system_prompt, user_prompt, SingleCardResult, think=False)
