"""
Import di documenti in un esame: lettura dei PDF, mappa degli argomenti e piano
di studio.

Queste funzioni preparano i dati e li aggiungono alla sessione, ma non fanno
commit: decide il chiamante quando rendere definitivo il risultato, così la
stessa logica serve sia le richieste sincrone sia gli import in background.
"""

from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlmodel import Session, select

from app.agents.mapper import map_exam_topics, map_incremental_topics
from app.agents.parser import get_pdf_page_count, parse_pdf_pages, split_page_into_chunks
from app.core.errors import NoReadableTextError
from app.core.planner import build_study_plan
from app.core.retrieval import index_exam_chunks
from app.db.models import (
    Document,
    DocumentChunk,
    Exam,
    ImportStage,
    StudyPlanItem,
    Topic,
)


@dataclass(frozen=True)
class StoredUpload:
    """Un file già validato e salvato su disco come PDF."""

    display_name: str
    path: Path


@dataclass(frozen=True)
class NewExamParams:
    title: str
    university: str | None = None
    degree_course: str | None = None
    professor: str | None = None
    exam_date: date | None = None
    daily_hours: float = 2.0
    syllabus_guidance: str | None = None


@dataclass(frozen=True)
class CreatedExam:
    exam: Exam
    topics: list[Topic]
    plan_items: list[StudyPlanItem]


@dataclass(frozen=True)
class AddedDocuments:
    documents: list[Document]
    topics: list[Topic]
    plan_items: list[StudyPlanItem]


class ImportObserver:
    """
    Riceve l'avanzamento di un import. L'implementazione base non fa nulla;
    un observer può sollevare un'eccezione per interrompere l'import.
    """

    def stage_started(self, stage: ImportStage) -> None:
        pass

    def file_started(self, display_name: str) -> None:
        pass

    def page_parsed(self) -> None:
        pass

    def file_finished(self) -> None:
        pass


def count_pages(uploads: list[StoredUpload]) -> int:
    return sum(get_pdf_page_count(upload.path) for upload in uploads)


def _parse_uploads(
    exam_id: str, uploads: list[StoredUpload], observer: ImportObserver
) -> tuple[list[Document], list[DocumentChunk]]:
    observer.stage_started(ImportStage.PARSING)
    docs: list[Document] = []
    chunks: list[DocumentChunk] = []
    for upload in uploads:
        observer.file_started(upload.display_name)
        parsed_pages = parse_pdf_pages(
            upload.path, on_page=lambda _page, _total: observer.page_parsed()
        )
        doc = Document(
            exam_id=exam_id,
            filename=upload.display_name,
            file_path=str(upload.path),
            page_count=get_pdf_page_count(upload.path),
        )
        docs.append(doc)

        chunk_index = 0
        for page in parsed_pages:
            for sub_text in split_page_into_chunks(page["text"]):
                chunks.append(
                    DocumentChunk(
                        document_id=doc.id,
                        page_number=page["page_number"],
                        chunk_index=chunk_index,
                        text=sub_text,
                    )
                )
                chunk_index += 1
        observer.file_finished()
    return docs, chunks


def _persist(
    session: Session,
    exam_id: str,
    docs: list[Document],
    chunks: list[DocumentChunk],
    topics: list[Topic],
    plan_items: list[StudyPlanItem],
) -> None:
    """Aggiunge alla sessione nell'ordine richiesto dalle foreign key."""
    session.add_all(docs)
    session.flush()
    session.add_all(chunks)
    session.flush()
    index_exam_chunks(session, exam_id, chunks)
    session.add_all(topics)
    session.flush()
    session.add_all(plan_items)


def create_exam_from_uploads(
    session: Session,
    exam_id: str,
    params: NewExamParams,
    uploads: list[StoredUpload],
    lang: str = "it",
    observer: ImportObserver | None = None,
) -> CreatedExam:
    observer = observer or ImportObserver()
    exam = Exam(
        id=exam_id,
        title=params.title,
        university=params.university,
        degree_course=params.degree_course,
        professor=params.professor,
        exam_date=params.exam_date,
        daily_hours=params.daily_hours,
        syllabus_guidance=(params.syllabus_guidance or "").strip() or None,
    )

    docs, chunks = _parse_uploads(exam.id, uploads, observer)
    if not chunks:
        raise NoReadableTextError("Nessun testo leggibile estratto dai file caricati.")

    observer.stage_started(ImportStage.MAPPING)
    web_summary, topics, prereqs_map = map_exam_topics(exam, chunks, docs, lang=lang)
    exam.web_context_summary = web_summary

    observer.stage_started(ImportStage.PLANNING)
    plan_items = build_study_plan(
        exam_id=exam.id,
        topics=topics,
        prereqs_map=prereqs_map,
        exam_date=exam.exam_date,
        daily_hours=exam.daily_hours,
        lang=lang,
    )

    observer.stage_started(ImportStage.SAVING)
    session.add(exam)
    session.flush()
    _persist(session, exam.id, docs, chunks, topics, plan_items)
    return CreatedExam(exam=exam, topics=topics, plan_items=plan_items)


def add_uploads_to_exam(
    session: Session,
    exam: Exam,
    uploads: list[StoredUpload],
    lang: str = "it",
    observer: ImportObserver | None = None,
) -> AddedDocuments:
    observer = observer or ImportObserver()
    docs, chunks = _parse_uploads(exam.id, uploads, observer)

    observer.stage_started(ImportStage.MAPPING)
    existing_topics = session.exec(select(Topic).where(Topic.exam_id == exam.id)).all()
    topics, prereqs_map = map_incremental_topics(exam, chunks, docs, existing_topics)

    observer.stage_started(ImportStage.PLANNING)
    plan_items: list[StudyPlanItem] = []
    if topics:
        plan_items = build_study_plan(
            exam_id=exam.id,
            topics=topics,
            prereqs_map=prereqs_map,
            exam_date=exam.exam_date,
            daily_hours=exam.daily_hours,
            include_mock_buffer=False,
            lang=lang,
        )

    observer.stage_started(ImportStage.SAVING)
    _persist(session, exam.id, docs, chunks, topics, plan_items)
    return AddedDocuments(documents=docs, topics=topics, plan_items=plan_items)
