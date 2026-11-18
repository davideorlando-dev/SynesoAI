import pytest
from sqlmodel import Session, select

import app.api.imports as imports_api
import app.services.exam_import as exam_import
import app.services.import_jobs as import_jobs
from app.core.errors import LLMRateLimitedError
from app.db.models import (
    Document,
    Exam,
    ImportJob,
    ImportStage,
    ImportStatus,
    Topic,
    TopicPriority,
)
from tests.conftest import make_pdf_bytes

PAGE_TEXT = "Capitolo 1: Principi generali del diritto civile e delle obbligazioni."


def _fake_map(exam, chunks, docs, **kwargs):
    topic = Topic(
        exam_id=exam.id,
        title="Obbligazioni",
        description="Fonti delle obbligazioni",
        priority=TopicPriority.CORE,
        estimated_minutes=30,
    )
    return None, [topic], {}


@pytest.fixture
def queued_jobs(monkeypatch):
    """Sostituisce l'esecuzione in background: i job restano in coda finché il test non li esegue."""
    scheduled: list[str] = []
    monkeypatch.setattr(imports_api, "schedule_import", scheduled.append)
    return scheduled


def _start_exam_import(client, pages: list[str] | None = None):
    pdf = make_pdf_bytes(pages or [PAGE_TEXT, PAGE_TEXT])
    return client.post(
        "/api/imports/exams",
        data={"title": "Diritto Civile", "exam_date": "2030-06-15"},
        files={"files": ("dispensa.pdf", pdf, "application/pdf")},
    )


def _uploaded_pdfs(isolated_env) -> list:
    return list((isolated_env["data_dir"] / "uploads").glob("*.pdf"))


def test_start_returns_immediately_with_a_queued_job_and_no_exam_yet(
    client, isolated_env, queued_jobs
):
    res = _start_exam_import(client)

    assert res.status_code == 202
    job = res.json()["job"]
    assert job["status"] == "queued"
    assert job["title"] == "Diritto Civile"
    assert job["files_total"] == 1
    assert job["pages_total"] == 2
    assert queued_jobs == [job["id"]]
    assert client.get("/api/imports/active").json()["jobs"][0]["id"] == job["id"]
    with Session(isolated_env["engine"]) as s:
        assert s.exec(select(Exam)).all() == []


def test_invalid_file_is_rejected_up_front_without_creating_a_job(
    client, isolated_env, queued_jobs
):
    res = client.post(
        "/api/imports/exams",
        data={"title": "Diritto Civile"},
        files={"files": ("finto.pdf", b"not a pdf", "application/pdf")},
    )

    assert res.status_code == 400
    assert queued_jobs == []
    assert _uploaded_pdfs(isolated_env) == []
    with Session(isolated_env["engine"]) as s:
        assert s.exec(select(ImportJob)).all() == []


def test_completed_job_creates_the_exam_and_reports_full_progress(
    client, isolated_env, queued_jobs, monkeypatch
):
    monkeypatch.setattr(exam_import, "map_exam_topics", _fake_map)
    job_id = _start_exam_import(client).json()["job"]["id"]

    import_jobs.run_import_job(job_id)

    job = client.get(f"/api/imports/{job_id}").json()["job"]
    assert job["status"] == "completed"
    assert job["stage"] is None
    assert job["error_code"] is None
    assert (job["files_done"], job["pages_done"]) == (1, 2)
    assert client.get("/api/imports/active").json()["jobs"] == []

    roadmap = client.get(f"/api/exams/{job['exam_id']}/roadmap")
    assert roadmap.status_code == 200
    with Session(isolated_env["engine"]) as s:
        assert s.get(Exam, job["exam_id"]).title == "Diritto Civile"
        assert len(s.exec(select(Topic)).all()) == 1


def test_failed_job_keeps_the_error_code_and_leaves_nothing_behind(
    client, isolated_env, queued_jobs, monkeypatch
):
    def _rate_limited(*args, **kwargs):
        raise LLMRateLimitedError("Limite di richieste raggiunto.")

    monkeypatch.setattr(exam_import, "map_exam_topics", _rate_limited)
    job_id = _start_exam_import(client).json()["job"]["id"]

    import_jobs.run_import_job(job_id)

    job = client.get(f"/api/imports/{job_id}").json()["job"]
    assert job["status"] == "failed"
    assert job["error_code"] == "llm_rate_limited"
    assert job["error_message"] == "Limite di richieste raggiunto."
    assert _uploaded_pdfs(isolated_env) == []
    with Session(isolated_env["engine"]) as s:
        assert s.exec(select(Exam)).all() == []
        assert s.exec(select(Document)).all() == []


def test_cancelling_before_the_job_runs_discards_it(
    client, isolated_env, queued_jobs, monkeypatch
):
    monkeypatch.setattr(exam_import, "map_exam_topics", _fake_map)
    job_id = _start_exam_import(client).json()["job"]["id"]

    assert client.post(f"/api/imports/{job_id}/cancel").status_code == 200
    import_jobs.run_import_job(job_id)

    job = client.get(f"/api/imports/{job_id}").json()["job"]
    assert job["status"] == "cancelled"
    assert job["error_code"] == "import_cancelled"
    assert _uploaded_pdfs(isolated_env) == []
    with Session(isolated_env["engine"]) as s:
        assert s.exec(select(Exam)).all() == []


def test_cancelling_while_pages_are_being_read_stops_the_import(
    client, isolated_env, queued_jobs, monkeypatch
):
    mapped: list[str] = []

    def _map_should_not_run(exam, chunks, docs, **kwargs):
        mapped.append(exam.id)
        return _fake_map(exam, chunks, docs)

    monkeypatch.setattr(exam_import, "map_exam_topics", _map_should_not_run)
    monkeypatch.setattr(import_jobs, "PROGRESS_WRITE_INTERVAL_S", 0.0)
    job_id = _start_exam_import(client, pages=[PAGE_TEXT] * 4).json()["job"]["id"]

    original_page_parsed = import_jobs.JobProgressObserver.page_parsed

    def _cancel_after_first_page(self):
        if self._pages_done == 0:
            with Session(isolated_env["engine"]) as s:
                job = s.get(ImportJob, job_id)
                job.cancel_requested = True
                s.add(job)
                s.commit()
        original_page_parsed(self)

    monkeypatch.setattr(
        import_jobs.JobProgressObserver, "page_parsed", _cancel_after_first_page
    )

    import_jobs.run_import_job(job_id)

    job = client.get(f"/api/imports/{job_id}").json()["job"]
    assert job["status"] == "cancelled"
    assert mapped == []
    assert _uploaded_pdfs(isolated_env) == []


def test_adding_documents_in_background_extends_an_existing_exam(
    client, isolated_env, queued_jobs, monkeypatch
):
    monkeypatch.setattr(exam_import, "map_exam_topics", _fake_map)
    monkeypatch.setattr(
        exam_import, "map_incremental_topics", lambda exam, chunks, docs, existing: ([], {})
    )
    exam_job_id = _start_exam_import(client).json()["job"]["id"]
    import_jobs.run_import_job(exam_job_id)
    exam_id = client.get(f"/api/imports/{exam_job_id}").json()["job"]["exam_id"]

    res = client.post(
        f"/api/imports/exams/{exam_id}/documents",
        files={"files": ("extra.pdf", make_pdf_bytes([PAGE_TEXT]), "application/pdf")},
    )
    assert res.status_code == 202
    import_jobs.run_import_job(res.json()["job"]["id"])

    job = client.get(f"/api/imports/{res.json()['job']['id']}").json()["job"]
    assert job["status"] == "completed"
    assert job["kind"] == "add_documents"
    with Session(isolated_env["engine"]) as s:
        assert len(s.exec(select(Document).where(Document.exam_id == exam_id)).all()) == 2

    assert client.post(
        "/api/imports/exams/missing/documents",
        files={"files": ("extra.pdf", make_pdf_bytes([PAGE_TEXT]), "application/pdf")},
    ).status_code == 404


def test_imports_left_active_by_a_previous_run_are_failed_and_cleaned_at_startup(
    client, isolated_env, queued_jobs
):
    job_id = _start_exam_import(client).json()["job"]["id"]
    with Session(isolated_env["engine"]) as s:
        job = s.get(ImportJob, job_id)
        job.status = ImportStatus.RUNNING
        job.stage = ImportStage.PARSING
        s.add(job)
        s.commit()

    assert import_jobs.recover_interrupted_imports() == 1

    job = client.get(f"/api/imports/{job_id}").json()["job"]
    assert job["status"] == "failed"
    assert job["error_code"] == "import_interrupted"
    assert _uploaded_pdfs(isolated_env) == []
    assert import_jobs.recover_interrupted_imports() == 0
