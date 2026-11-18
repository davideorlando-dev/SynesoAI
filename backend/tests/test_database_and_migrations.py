import sqlite3
from sqlalchemy import text
from sqlmodel import Session, select
from contextlib import closing

import app.services.exam_import as exam_import
import app.db.database as db_mod
from app.db.models import (
    Document,
    DocumentChunk,
    Exam,
    FeynmanSession,
    Flashcard,
    MockExamSession,
    StudyActivityLog,
    StudyPlanItem,
    Topic,
    TopicPriority,
)
from tests.conftest import make_pdf_bytes


def test_v0_migration_upgrades_to_latest_and_creates_backup(isolated_env):
    db_path = isolated_env["data_dir"] / "syneso.db"

    # Release all pooled SQLite connections before replacing the database.
    db_mod.engine.dispose()
    isolated_env["engine"].dispose()

    db_path.unlink(missing_ok=True)
    with closing(sqlite3.connect(str(db_path))) as conn:
        conn.executescript(
            """
            CREATE TABLE exam (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                university TEXT,
                degree_course TEXT,
                professor TEXT,
                exam_date TEXT,
                daily_hours REAL NOT NULL DEFAULT 2.0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE topic (
                id TEXT PRIMARY KEY,
                exam_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'IMPORTANT',
                estimated_minutes INTEGER NOT NULL DEFAULT 45,
                status TEXT NOT NULL DEFAULT 'READY'
            );
            INSERT INTO exam (id, title, created_at) VALUES ('e1', 'Diritto Privato', '2026-01-01T00:00:00Z');
            PRAGMA user_version = 0;
            """
        )

    db_mod.init_db()

    with db_mod.engine.connect() as conn:
        ver = conn.execute(text("PRAGMA user_version")).scalar_one()
        assert ver == db_mod.LATEST_SCHEMA_VERSION
        exam_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(exam)")).all()}
        topic_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(topic)")).all()}
        assert "syllabus_guidance" in exam_cols
        assert "excluded" in topic_cols
        assert "notes_markdown" in topic_cols
        assert "feynman_draft" in topic_cols

    backups = list((isolated_env["data_dir"] / "backups").glob(f"syneso_pre_v{db_mod.LATEST_SCHEMA_VERSION}_*.db"))
    assert len(backups) >= 1


def test_create_exam_rollback_leaves_no_orphan_db_or_pdf(client, isolated_env, monkeypatch):
    def _boom(*args, **kwargs):
        raise RuntimeError("LLM temporaneamente offline")

    monkeypatch.setattr(exam_import, "map_exam_topics", _boom)

    pdf = make_pdf_bytes(["Capitolo 1: Principi generali del diritto civile e obbligazioni."])
    res = client.post(
        "/api/exams/",
        data={"title": "Diritto Civile", "daily_hours": "2"},
        files={"files": ("dispensa.pdf", pdf, "application/pdf")},
    )
    assert res.status_code == 502

    with Session(isolated_env["engine"]) as s:
        assert s.exec(select(Exam)).all() == []
        assert s.exec(select(Document)).all() == []
        assert s.exec(select(DocumentChunk)).all() == []

    uploads = list((isolated_env["data_dir"] / "uploads").glob("*.pdf"))
    assert uploads == []


def test_delete_exam_cascades_cleanly_with_foreign_keys(client, isolated_env, monkeypatch):
    def _fake_map(exam, chunks, docs, lang="it"):
        t = Topic(
            exam_id=exam.id,
            title="Obbligazioni",
            description="Nozioni base",
            priority=TopicPriority.CORE,
            source_pages_json='[{"doc_id": "' + docs[0].id + '", "page": 1}]',
        )
        return "Sintesi", [t], {t.id: []}

    monkeypatch.setattr(exam_import, "map_exam_topics", _fake_map)

    pdf = make_pdf_bytes(["Le obbligazioni sorgono da contratto, fatto illecito o altro atto idoneo."])
    res = client.post(
        "/api/exams/",
        data={"title": "Privato"},
        files={"files": ("privato.pdf", pdf, "application/pdf")},
    )
    assert res.status_code == 200
    exam_id = res.json()["exam_id"]

    with Session(isolated_env["engine"]) as s:
        topic = s.exec(select(Topic).where(Topic.exam_id == exam_id)).first()
        s.add(FeynmanSession(topic_id=topic.id, final_score=80, passed=True))
        s.add(MockExamSession(exam_id=exam_id, score_30=26, passed=True))
        s.add(Flashcard(exam_id=exam_id, topic_id=topic.id, front="Q", back="A", fsrs_card_json="{}"))
        s.add(StudyActivityLog(exam_id=exam_id, activity_type="NOTES"))
        s.commit()

    del_res = client.delete(f"/api/exams/{exam_id}")
    assert del_res.status_code == 200

    with Session(isolated_env["engine"]) as s:
        assert s.exec(select(Exam)).all() == []
        assert s.exec(select(Topic)).all() == []
        assert s.exec(select(Flashcard)).all() == []
        assert s.exec(select(FeynmanSession)).all() == []
        assert s.exec(select(MockExamSession)).all() == []
        assert s.exec(select(StudyPlanItem)).all() == []
        assert s.exec(select(StudyActivityLog)).all() == []
