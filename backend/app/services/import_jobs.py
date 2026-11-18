"""
Esecuzione in background degli import.

Un solo import alla volta: OCR e chiamate al modello sono pesanti e soggette a
limiti di richieste. Lo stato vive nella tabella `importjob`, così l'interfaccia
può mostrarlo anche dopo un ricaricamento della pagina.
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlmodel import Session, col, select

from app.core.errors import ImportCancelledError, ImportExamMissingError, SynesoError
from app.db import database as db
from app.db.models import Exam, ImportJob, ImportKind, ImportStage, ImportStatus, utc_now
from app.services.exam_import import (
    ImportObserver,
    NewExamParams,
    StoredUpload,
    add_uploads_to_exam,
    create_exam_from_uploads,
)

ACTIVE_STATUSES = (ImportStatus.QUEUED, ImportStatus.RUNNING)
PROGRESS_WRITE_INTERVAL_S = 0.5
MAX_ERROR_MESSAGE_CHARS = 500
GENERIC_FAILURE_CODE = "import_failed"
INTERRUPTED_CODE = "import_interrupted"

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="syneso-import")


@dataclass(frozen=True)
class JobSpec:
    """Ciò che serve per eseguire un job, letto una volta sola all'avvio."""

    job_id: str
    kind: ImportKind
    exam_id: str
    title: str
    params: dict
    uploads: list[StoredUpload]


def schedule_import(job_id: str) -> None:
    _executor.submit(run_import_job, job_id)


def encode_uploads(uploads: list[StoredUpload]) -> str:
    return json.dumps(
        [{"display_name": u.display_name, "path": str(u.path)} for u in uploads]
    )


def decode_uploads(files_json: str) -> list[StoredUpload]:
    return [
        StoredUpload(display_name=item["display_name"], path=Path(item["path"]))
        for item in json.loads(files_json or "[]")
    ]


def encode_exam_params(params: NewExamParams, lang: str) -> str:
    return json.dumps(
        {
            "lang": lang,
            "university": params.university,
            "degree_course": params.degree_course,
            "professor": params.professor,
            "exam_date": params.exam_date.isoformat() if params.exam_date else None,
            "daily_hours": params.daily_hours,
            "syllabus_guidance": params.syllabus_guidance,
        }
    )


def _decode_exam_params(title: str, raw: dict) -> NewExamParams:
    exam_date = raw.get("exam_date")
    return NewExamParams(
        title=title,
        university=raw.get("university"),
        degree_course=raw.get("degree_course"),
        professor=raw.get("professor"),
        exam_date=date.fromisoformat(exam_date) if exam_date else None,
        daily_hours=float(raw.get("daily_hours") or 2.0),
        syllabus_guidance=raw.get("syllabus_guidance"),
    )


def discard_uploads(uploads: list[StoredUpload]) -> None:
    for upload in uploads:
        upload.path.unlink(missing_ok=True)


class JobProgressObserver(ImportObserver):
    """
    Scrive l'avanzamento sul job con sessioni brevi e indipendenti da quella
    dell'import, e interrompe l'import se ne è stato chiesto l'annullamento.
    """

    def __init__(self, job_id: str, min_interval_s: float | None = None):
        self._job_id = job_id
        self._min_interval_s = (
            PROGRESS_WRITE_INTERVAL_S if min_interval_s is None else min_interval_s
        )
        self._last_write = 0.0
        self._pages_done = 0
        self._files_done = 0
        self._current_file: str | None = None
        self._stage: ImportStage | None = None

    def stage_started(self, stage: ImportStage) -> None:
        self._stage = stage
        self._write(force=True)

    def file_started(self, display_name: str) -> None:
        self._current_file = display_name
        self._write(force=True)

    def page_parsed(self) -> None:
        self._pages_done += 1
        self._write(force=False)

    def file_finished(self) -> None:
        self._files_done += 1
        self._write(force=True)

    def _write(self, force: bool) -> None:
        now = time.monotonic()
        if not force and now - self._last_write < self._min_interval_s:
            return
        self._last_write = now
        with Session(db.engine) as session:
            job = session.get(ImportJob, self._job_id)
            if job is None:
                return
            if job.cancel_requested:
                raise ImportCancelledError("Import annullato.")
            job.stage = self._stage
            job.pages_done = self._pages_done
            job.files_done = self._files_done
            job.current_file = self._current_file
            session.add(job)
            session.commit()


def _execute(session: Session, spec: JobSpec) -> None:
    lang = spec.params.get("lang") or "it"
    observer = JobProgressObserver(spec.job_id)

    if spec.kind == ImportKind.CREATE_EXAM:
        create_exam_from_uploads(
            session,
            exam_id=spec.exam_id,
            params=_decode_exam_params(spec.title, spec.params),
            uploads=spec.uploads,
            lang=lang,
            observer=observer,
        )
        return

    exam = session.get(Exam, spec.exam_id)
    if exam is None:
        raise ImportExamMissingError("L'esame a cui aggiungere i documenti non esiste più.")
    add_uploads_to_exam(session, exam, spec.uploads, lang=lang, observer=observer)


def _claim(job_id: str) -> JobSpec | None:
    """Porta il job da QUEUED a RUNNING; None se non è (più) da eseguire."""
    with Session(db.engine) as session:
        job = session.get(ImportJob, job_id)
        if job is None or job.status != ImportStatus.QUEUED:
            return None
        spec = JobSpec(
            job_id=job.id,
            kind=job.kind,
            exam_id=job.exam_id,
            title=job.title,
            params=json.loads(job.params_json or "{}"),
            uploads=decode_uploads(job.files_json),
        )
        job.status = ImportStatus.RUNNING
        session.add(job)
        session.commit()
        return spec


def _finish_with_error(job_id: str, exc: BaseException) -> None:
    cancelled = isinstance(exc, ImportCancelledError)
    with Session(db.engine) as session:
        job = session.get(ImportJob, job_id)
        if job is None:
            return
        job.status = ImportStatus.CANCELLED if cancelled else ImportStatus.FAILED
        job.error_code = exc.code if isinstance(exc, SynesoError) else GENERIC_FAILURE_CODE
        job.error_message = str(exc)[:MAX_ERROR_MESSAGE_CHARS]
        job.finished_at = utc_now()
        session.add(job)
        session.commit()


def run_import_job(job_id: str) -> None:
    """Esegue un job in coda. Non solleva: l'esito viene registrato sul job."""
    spec = _claim(job_id)
    if spec is None:
        return

    try:
        with Session(db.engine) as session:
            # Il primo aggiornamento di avanzamento verifica anche l'annullamento.
            _execute(session, spec)
            # Esito e dati dell'esame nella stessa transazione: o entrambi o nessuno.
            job = session.get(ImportJob, job_id)
            if job is not None:
                job.status = ImportStatus.COMPLETED
                job.stage = None
                job.current_file = None
                job.finished_at = utc_now()
                session.add(job)
            session.commit()
    except Exception as exc:
        discard_uploads(spec.uploads)
        _finish_with_error(job_id, exc)


def recover_interrupted_imports() -> int:
    """
    All'avvio nessun import può essere in corso: quelli rimasti attivi sono stati
    interrotti dalla chiusura dell'app. Vengono segnati come falliti e i loro
    file rimossi, perché nessun dato dell'import era ancora stato salvato.
    """
    with Session(db.engine) as session:
        interrupted = session.exec(
            select(ImportJob).where(col(ImportJob.status).in_(ACTIVE_STATUSES))
        ).all()
        for job in interrupted:
            discard_uploads(decode_uploads(job.files_json))
            job.status = ImportStatus.FAILED
            job.error_code = INTERRUPTED_CODE
            job.error_message = "Import interrotto dalla chiusura dell'app."
            job.finished_at = utc_now()
            session.add(job)
        session.commit()
        return len(interrupted)
