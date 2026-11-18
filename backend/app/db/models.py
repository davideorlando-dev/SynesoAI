from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional
from uuid import uuid4
from sqlmodel import Field, Relationship, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class TopicPriority(str, Enum):
    CORE = "CORE"
    IMPORTANT = "IMPORTANT"
    DETAIL = "DETAIL"


class TopicStatus(str, Enum):
    LOCKED = "LOCKED"
    READY = "READY"
    FEYNMAN_PENDING = "FEYNMAN_PENDING"
    MASTERED = "MASTERED"


class CardType(str, Enum):
    BASIC = "BASIC"
    CLOZE = "CLOZE"
    EXAM_Q = "EXAM_Q"


class HighlightColor(str, Enum):
    YELLOW = "yellow"
    GREEN = "green"
    PINK = "pink"
    BLUE = "blue"


class ImportKind(str, Enum):
    CREATE_EXAM = "create_exam"
    ADD_DOCUMENTS = "add_documents"


class ImportStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ImportStage(str, Enum):
    PARSING = "parsing"
    MAPPING = "mapping"
    PLANNING = "planning"
    SAVING = "saving"


class Exam(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    title: str                                   # es. "Sistemi Operativi"
    university: Optional[str] = None             # es. "Politecnico di Milano"
    degree_course: Optional[str] = None          # es. "Ingegneria Informatica"
    professor: Optional[str] = None
    exam_date: Optional[date] = None
    daily_hours: float = 2.0
    web_context_summary: Optional[str] = None    # Sintesi trovata online sul corso
    syllabus_guidance: Optional[str] = None      # Focus del prof / parti da includere o escludere
    created_at: datetime = Field(default_factory=utc_now)

    documents: list["Document"] = Relationship(back_populates="exam")
    topics: list["Topic"] = Relationship(back_populates="exam")
    plan_items: list["StudyPlanItem"] = Relationship(back_populates="exam")
    


class Document(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    exam_id: str = Field(foreign_key="exam.id", index=True)
    filename: str
    file_path: str
    page_count: int = 0
    created_at: datetime = Field(default_factory=utc_now)

    exam: Optional[Exam] = Relationship(back_populates="documents")
    chunks: list["DocumentChunk"] = Relationship(back_populates="document")


class DocumentChunk(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    document_id: str = Field(foreign_key="document.id", index=True)
    page_number: int                             # 1-based per il PDF viewer
    chunk_index: int
    text: str

    document: Optional[Document] = Relationship(back_populates="chunks")


class Topic(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    exam_id: str = Field(foreign_key="exam.id", index=True)
    title: str
    description: str
    priority: TopicPriority = TopicPriority.IMPORTANT
    estimated_minutes: int = 45
    prerequisites_json: str = "[]"               # Lista di topic_id prerequisiti
    source_pages_json: str = "[]"                # es. [{"doc_id": "...", "pages": [4, 5]}]
    notes_markdown: Optional[str] = None         # Generato lazy
    highlights_json: str = "[]"                  # Anchor per PDF viewer
    web_sources_json: str = "[]"
    status: TopicStatus = TopicStatus.READY
    mastery_score: int = 0                       # 0-100
    excluded: bool = Field(default=False)
    feynman_draft: Optional[str] = None          # Bozza non ancora inviata

    exam: Optional[Exam] = Relationship(back_populates="topics")


class StudyPlanItem(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    exam_id: str = Field(foreign_key="exam.id", index=True)
    topic_id: Optional[str] = Field(default=None, foreign_key="topic.id")
    scheduled_date: date = Field(index=True)
    task_type: str = "LEARN_TOPIC"               # LEARN_TOPIC | MOCK_REVIEW
    title: str
    completed: bool = False

    exam: Optional[Exam] = Relationship(back_populates="plan_items")


class FeynmanSession(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    topic_id: str = Field(foreign_key="topic.id", index=True)
    transcript_json: str = "[]"
    gaps_json: str = "[]"
    final_score: int = 0
    passed: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class Flashcard(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    exam_id: str = Field(foreign_key="exam.id", index=True)
    topic_id: str = Field(foreign_key="topic.id", index=True)
    card_type: CardType = CardType.BASIC
    front: str
    back: str
    source_ref_json: str = "{}"                  # {"doc_id": "...", "page": 12, "quote": "..."}
    origin: str = "SYNTHESIZER"                  # SYNTHESIZER | FEYNMAN_GAP
    fsrs_card_json: str                          # Stato FSRS serializzato
    due_at: datetime = Field(default_factory=utc_now, index=True)

class MockExamSession(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    exam_id: str = Field(foreign_key="exam.id", index=True)
    score_30: int = 0
    passed: bool = False
    overall_feedback: str = ""
    questions_json: str = "[]"
    answers_json: str = "{}"
    feedback_json: str = "[]"
    created_at: datetime = Field(default_factory=utc_now, index=True)

class StudyActivityLog(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    exam_id: str = Field(foreign_key="exam.id", index=True)
    activity_type: str = "FSRS_REVIEW"  # FSRS_REVIEW | FEYNMAN | MOCK | NOTES
    created_at: datetime = Field(default_factory=utc_now, index=True)


class TopicHighlight(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    topic_id: str = Field(foreign_key="topic.id", index=True)
    text: str                                    # Passaggio evidenziato, spazi normalizzati
    color: HighlightColor = HighlightColor.YELLOW
    created_at: datetime = Field(default_factory=utc_now)


class TutorMessage(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    topic_id: str = Field(foreign_key="topic.id", index=True)
    question: str
    selected_text: Optional[str] = None
    answer_markdown: str = ""
    citations_json: str = "[]"                   # [{"doc_id": "...", "filename": "...", "page_number": 3}]
    created_at: datetime = Field(default_factory=utc_now, index=True)


class ImportJob(SQLModel, table=True):
    """
    Import di documenti eseguito in background.

    L'esame e i suoi dati vengono scritti in un'unica transazione alla fine:
    finché il job non è COMPLETED, `exam_id` di un CREATE_EXAM non corrisponde
    ancora a una riga di `exam` (per questo non è una foreign key).
    """

    id: str = Field(default_factory=new_id, primary_key=True)
    kind: ImportKind
    status: ImportStatus = Field(default=ImportStatus.QUEUED, index=True)
    stage: Optional[ImportStage] = None
    exam_id: str = Field(index=True)
    title: str                                   # Titolo dell'esame, per mostrarlo durante l'import
    params_json: str = "{}"                      # Parametri della richiesta (lingua, dati dell'esame)
    files_json: str = "[]"                       # [{"display_name": "...", "path": "..."}]
    files_total: int = 0
    files_done: int = 0
    pages_total: int = 0
    pages_done: int = 0
    current_file: Optional[str] = None
    cancel_requested: bool = False
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    finished_at: Optional[datetime] = None
