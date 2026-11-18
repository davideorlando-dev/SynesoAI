"""
Annotazioni dello studente: evidenziazioni sugli appunti, conversazioni con il
tutor e bozze Feynman.

Vivono nel database (e quindi nei backup) invece che nello storage del browser,
che è legato all'origine http://host:porta e si perde se la porta cambia.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, col, delete, select

from app.core.errors import (
    ExamNotFoundError,
    HighlightNotFoundError,
    TopicNotFoundError,
)
from app.db.database import get_session
from app.db.models import Exam, HighlightColor, Topic, TopicHighlight, TutorMessage

MAX_HIGHLIGHT_CHARS = 1200
MAX_DRAFT_CHARS = 20_000

router = APIRouter(prefix="/study", tags=["annotations"])


class TutorCitationSchema(BaseModel):
    doc_id: str | None = None
    filename: str | None = None
    page_number: int


class HighlightCreateRequest(BaseModel):
    text: str = Field(min_length=3, max_length=MAX_HIGHLIGHT_CHARS)
    color: HighlightColor = HighlightColor.YELLOW


class FeynmanDraftRequest(BaseModel):
    text: str = Field(default="", max_length=MAX_DRAFT_CHARS)


class ImportedHighlight(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_HIGHLIGHT_CHARS)
    color: HighlightColor = HighlightColor.YELLOW


class ImportedTutorMessage(BaseModel):
    question: str = Field(min_length=1)
    selected_text: str | None = None
    answer_markdown: str = ""
    citations: list[TutorCitationSchema] = Field(default_factory=list)


class AnnotationsImportRequest(BaseModel):
    """Annotazioni salvate dalle versioni precedenti nello storage del browser."""

    highlights: dict[str, list[ImportedHighlight]] = Field(default_factory=dict)
    tutor_threads: dict[str, list[ImportedTutorMessage]] = Field(default_factory=dict)
    feynman_drafts: dict[str, str] = Field(default_factory=dict)


def normalize_highlight_text(text: str) -> str:
    return " ".join(text.split())


def serialize_highlight(highlight: TopicHighlight) -> dict:
    return {"id": highlight.id, "text": highlight.text, "color": highlight.color.value}


def serialize_tutor_message(message: TutorMessage) -> dict:
    return {
        "id": message.id,
        "question": message.question,
        "selected_text": message.selected_text,
        "answer_markdown": message.answer_markdown,
        "citations": json.loads(message.citations_json or "[]"),
    }


def delete_topic_annotations(session: Session, topic_ids: list[str]) -> None:
    """Rimuove le annotazioni dei topic indicati (da chiamare prima di eliminarli)."""
    if not topic_ids:
        return
    session.exec(delete(TopicHighlight).where(col(TopicHighlight.topic_id).in_(topic_ids)))
    session.exec(delete(TutorMessage).where(col(TutorMessage.topic_id).in_(topic_ids)))


def _get_topic_or_404(session: Session, topic_id: str) -> Topic:
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")
    return topic


def _get_exam_or_404(session: Session, exam_id: str) -> Exam:
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")
    return exam


def _exam_topic_ids(session: Session, exam_id: str) -> list[str]:
    return list(session.exec(select(Topic.id).where(Topic.exam_id == exam_id)).all())


def _upsert_highlight(
    session: Session, topic_id: str, text: str, color: HighlightColor
) -> TopicHighlight:
    """Una sola evidenziazione per passaggio: riapplicarla ne cambia il colore."""
    existing = session.exec(
        select(TopicHighlight).where(
            TopicHighlight.topic_id == topic_id, TopicHighlight.text == text
        )
    ).first()
    if existing:
        existing.color = color
        session.add(existing)
        return existing
    highlight = TopicHighlight(topic_id=topic_id, text=text, color=color)
    session.add(highlight)
    return highlight


@router.get("/exams/{exam_id}/annotations")
def get_exam_annotations(exam_id: str, session: Session = Depends(get_session)):
    _get_exam_or_404(session, exam_id)
    topic_ids = _exam_topic_ids(session, exam_id)

    highlights: dict[str, list[dict]] = {}
    tutor_threads: dict[str, list[dict]] = {}
    if topic_ids:
        for highlight in session.exec(
            select(TopicHighlight)
            .where(col(TopicHighlight.topic_id).in_(topic_ids))
            .order_by(col(TopicHighlight.created_at))
        ).all():
            highlights.setdefault(highlight.topic_id, []).append(
                serialize_highlight(highlight)
            )
        for message in session.exec(
            select(TutorMessage)
            .where(col(TutorMessage.topic_id).in_(topic_ids))
            .order_by(col(TutorMessage.created_at))
        ).all():
            tutor_threads.setdefault(message.topic_id, []).append(
                serialize_tutor_message(message)
            )

    return {"highlights": highlights, "tutor_threads": tutor_threads}


@router.post("/topics/{topic_id}/highlights")
def create_topic_highlight(
    topic_id: str,
    body: HighlightCreateRequest,
    session: Session = Depends(get_session),
):
    _get_topic_or_404(session, topic_id)
    text = normalize_highlight_text(body.text)
    if len(text) < 3:
        raise HTTPException(status_code=400, detail="Testo da evidenziare troppo breve.")

    highlight = _upsert_highlight(session, topic_id, text, body.color)
    session.commit()
    session.refresh(highlight)
    return {"highlight": serialize_highlight(highlight)}


@router.delete("/highlights/{highlight_id}")
def delete_topic_highlight(highlight_id: str, session: Session = Depends(get_session)):
    highlight = session.get(TopicHighlight, highlight_id)
    if not highlight:
        raise HighlightNotFoundError("L'evidenziazione non esiste più.")
    session.delete(highlight)
    session.commit()
    return {"deleted": highlight_id}


@router.delete("/topics/{topic_id}/tutor-messages")
def clear_topic_tutor_messages(topic_id: str, session: Session = Depends(get_session)):
    _get_topic_or_404(session, topic_id)
    session.exec(delete(TutorMessage).where(col(TutorMessage.topic_id) == topic_id))
    session.commit()
    return {"topic_id": topic_id}


@router.put("/topics/{topic_id}/feynman-draft")
def save_feynman_draft(
    topic_id: str,
    body: FeynmanDraftRequest,
    session: Session = Depends(get_session),
):
    topic = _get_topic_or_404(session, topic_id)
    topic.feynman_draft = body.text or None
    session.add(topic)
    session.commit()
    return {"topic_id": topic_id, "text": topic.feynman_draft or ""}


@router.post("/exams/{exam_id}/annotations/import")
def import_legacy_annotations(
    exam_id: str,
    body: AnnotationsImportRequest,
    session: Session = Depends(get_session),
):
    """
    Importa le annotazioni delle versioni precedenti. Ripetibile senza duplicati:
    non sovrascrive conversazioni o bozze già presenti e ignora i topic di altri esami.
    """
    _get_exam_or_404(session, exam_id)
    topics = {
        t.id: t for t in session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    }

    imported_highlights = 0
    for topic_id, items in body.highlights.items():
        if topic_id not in topics:
            continue
        for item in items:
            text = normalize_highlight_text(item.text)
            if text:
                _upsert_highlight(session, topic_id, text, item.color)
                imported_highlights += 1
        session.flush()

    imported_messages = 0
    for topic_id, messages in body.tutor_threads.items():
        if topic_id not in topics or not messages:
            continue
        already_has_thread = session.exec(
            select(TutorMessage.id).where(TutorMessage.topic_id == topic_id)
        ).first()
        if already_has_thread:
            continue
        for msg in messages:
            session.add(
                TutorMessage(
                    topic_id=topic_id,
                    question=msg.question,
                    selected_text=msg.selected_text,
                    answer_markdown=msg.answer_markdown,
                    citations_json=json.dumps([c.model_dump() for c in msg.citations]),
                )
            )
            imported_messages += 1

    imported_drafts = 0
    for topic_id, draft in body.feynman_drafts.items():
        topic = topics.get(topic_id)
        if topic and draft.strip() and not topic.feynman_draft:
            topic.feynman_draft = draft[:MAX_DRAFT_CHARS]
            session.add(topic)
            imported_drafts += 1

    session.commit()
    return {
        "highlights": imported_highlights,
        "tutor_messages": imported_messages,
        "feynman_drafts": imported_drafts,
    }
