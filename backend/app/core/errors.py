"""
Errori applicativi tipizzati.

Ogni errore porta un `code` stabile (usabile dal frontend per tradurre il
messaggio) e lo `status_code` HTTP con cui viene esposto dall'handler globale
registrato in `app.main`. Derivano da RuntimeError per restare compatibili con
il codice che intercetta gli errori generici.
"""


class SynesoError(RuntimeError):
    code: str = "internal_error"
    status_code: int = 500


class LLMError(SynesoError):
    """Errore nella comunicazione con il servizio di inferenza."""

    code = "llm_error"
    status_code = 502


class LLMKeyMissingError(LLMError):
    code = "llm_key_missing"
    status_code = 400


class LLMKeyInvalidError(LLMError):
    code = "llm_key_invalid"
    status_code = 400


class LLMUpstreamError(LLMError):
    """Il servizio ha rifiutato la richiesta o non è raggiungibile."""

    code = "llm_unavailable"
    status_code = 502


class LLMRateLimitedError(LLMUpstreamError):
    code = "llm_rate_limited"
    status_code = 429


class LLMInvalidResponseError(LLMError):
    """Il modello ha risposto, ma con un contenuto vuoto o non conforme allo schema."""

    code = "llm_invalid_response"
    status_code = 502


class GradingIncompleteError(LLMInvalidResponseError):
    code = "grading_incomplete"


class NoActiveTopicsError(SynesoError):
    code = "no_active_topics"
    status_code = 409


class NoReadableTextError(SynesoError):
    code = "no_readable_text"
    status_code = 400


class ImportCancelledError(SynesoError):
    code = "import_cancelled"
    status_code = 409


class ImportExamMissingError(SynesoError):
    code = "import_exam_missing"
    status_code = 404


class NotFoundError(SynesoError):
    """Risorsa inesistente: il codice dice di quale si tratta."""

    code = "not_found"
    status_code = 404


class ExamNotFoundError(NotFoundError):
    code = "exam_not_found"


class TopicNotFoundError(NotFoundError):
    code = "topic_not_found"


class DocumentNotFoundError(NotFoundError):
    code = "document_not_found"


class FlashcardNotFoundError(NotFoundError):
    code = "flashcard_not_found"


class PlanItemNotFoundError(NotFoundError):
    code = "plan_item_not_found"


class HighlightNotFoundError(NotFoundError):
    code = "highlight_not_found"


class ImportNotFoundError(NotFoundError):
    code = "import_not_found"


class PdfFileMissingError(NotFoundError):
    code = "pdf_file_missing"
