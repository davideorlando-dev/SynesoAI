"""Import di documenti in background: avvio, stato e annullamento."""

from datetime import date

from fastapi import APIRouter, Depends, File, Form
from sqlmodel import Session, col, select

from app.api.uploads import BinaryUploadFile, store_uploads
from app.core.errors import (
    ExamNotFoundError,
    ImportNotFoundError,
)
from app.db.database import get_session
from app.db.models import Exam, ImportJob, ImportKind, ImportStatus, new_id
from app.services.exam_import import NewExamParams, StoredUpload, count_pages
from app.services.import_jobs import (
    ACTIVE_STATUSES,
    encode_exam_params,
    encode_uploads,
    schedule_import,
)

router = APIRouter(prefix="/imports", tags=["imports"])


def serialize_job(job: ImportJob) -> dict:
    return {
        "id": job.id,
        "kind": job.kind.value,
        "status": job.status.value,
        "stage": job.stage.value if job.stage else None,
        "exam_id": job.exam_id,
        "title": job.title,
        "files_total": job.files_total,
        "files_done": job.files_done,
        "pages_total": job.pages_total,
        "pages_done": job.pages_done,
        "current_file": job.current_file,
        "error_code": job.error_code,
        "error_message": job.error_message,
    }


def _enqueue(
    session: Session,
    kind: ImportKind,
    exam_id: str,
    title: str,
    params_json: str,
    uploads: list[StoredUpload],
) -> ImportJob:
    job = ImportJob(
        kind=kind,
        exam_id=exam_id,
        title=title,
        params_json=params_json,
        files_json=encode_uploads(uploads),
        files_total=len(uploads),
        pages_total=count_pages(uploads),
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    schedule_import(job.id)
    return job


@router.post("/exams", status_code=202)
def start_exam_import(
    title: str = Form(...),
    university: str | None = Form(None),
    degree_course: str | None = Form(None),
    professor: str | None = Form(None),
    exam_date: date | None = Form(None),
    daily_hours: float = Form(2.0),
    lang: str = Form("it"),
    files: list[BinaryUploadFile] = File(...),
    session: Session = Depends(get_session),
    syllabus_guidance: str | None = Form(None),
):
    exam_id = new_id()
    uploads = store_uploads(files, exam_id)
    params = NewExamParams(
        title=title,
        university=university,
        degree_course=degree_course,
        professor=professor,
        exam_date=exam_date,
        daily_hours=daily_hours,
        syllabus_guidance=syllabus_guidance,
    )
    job = _enqueue(
        session,
        ImportKind.CREATE_EXAM,
        exam_id=exam_id,
        title=title,
        params_json=encode_exam_params(params, lang),
        uploads=uploads,
    )
    return {"job": serialize_job(job)}


@router.post("/exams/{exam_id}/documents", status_code=202)
def start_documents_import(
    exam_id: str,
    lang: str = Form("it"),
    files: list[BinaryUploadFile] = File(...),
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")
    uploads = store_uploads(files, exam.id)
    job = _enqueue(
        session,
        ImportKind.ADD_DOCUMENTS,
        exam_id=exam.id,
        title=exam.title,
        params_json=encode_exam_params(NewExamParams(title=exam.title), lang),
        uploads=uploads,
    )
    return {"job": serialize_job(job)}


@router.get("/active")
def list_active_imports(session: Session = Depends(get_session)):
    jobs = session.exec(
        select(ImportJob)
        .where(col(ImportJob.status).in_(ACTIVE_STATUSES))
        .order_by(col(ImportJob.created_at))
    ).all()
    return {"jobs": [serialize_job(job) for job in jobs]}


@router.get("/{job_id}")
def get_import(job_id: str, session: Session = Depends(get_session)):
    job = session.get(ImportJob, job_id)
    if not job:
        raise ImportNotFoundError("L'import non esiste più.")
    return {"job": serialize_job(job)}


@router.post("/{job_id}/cancel")
def cancel_import(job_id: str, session: Session = Depends(get_session)):
    job = session.get(ImportJob, job_id)
    if not job:
        raise ImportNotFoundError("L'import non esiste più.")
    if job.status in (ImportStatus.QUEUED, ImportStatus.RUNNING):
        job.cancel_requested = True
        session.add(job)
        session.commit()
        session.refresh(job)
    return {"job": serialize_job(job)}
