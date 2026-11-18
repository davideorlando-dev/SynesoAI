from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Callable
from sqlalchemy import Connection, event, text
from sqlmodel import Session, SQLModel, create_engine
from app.config import settings
from contextlib import closing

LATEST_SCHEMA_VERSION = 5

engine = create_engine(
    f"sqlite:///{settings.db_path}",
    connect_args={"check_same_thread": False, "timeout": 15.0},
)


@event.listens_for(engine, "connect")
def _configure_sqlite_connection(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA busy_timeout=5000;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


def _backups_dir() -> Path:
    path = settings.data_dir / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _prune_backups(pattern: str, keep: int) -> None:
    files = sorted(
        _backups_dir().glob(pattern),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in files[keep:]:
        old.unlink(missing_ok=True)


def create_db_backup(reason: str = "manual", keep: int = 5) -> Path | None:
    db_path = settings.db_path
    if not db_path.exists() or db_path.stat().st_size == 0:
        return None

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest = _backups_dir() / f"syneso_{reason}_{stamp}.db"

    with closing(sqlite3.connect(str(db_path), timeout=10.0)) as src:
        with closing(sqlite3.connect(str(dest))) as dst:
            src.backup(dst)

    _prune_backups(f"syneso_{reason}_*.db", keep=keep)
    return dest

def _ensure_daily_backup(keep: int = 5) -> None:
    db_path = settings.db_path
    if not db_path.exists() or db_path.stat().st_size == 0:
        return

    day_tag = datetime.now(timezone.utc).strftime("%Y%m%d")
    dest = _backups_dir() / f"syneso_daily_{day_tag}.db"

    if dest.exists():
        return

    with closing(sqlite3.connect(str(db_path), timeout=10.0)) as src:
        with closing(sqlite3.connect(str(dest))) as dst:
            src.backup(dst)

    _prune_backups("syneso_daily_*.db", keep=keep)


def _table_exists(conn: Connection, table_name: str) -> bool:
    row = conn.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": table_name},
    ).first()
    return row is not None


def _column_exists(conn: Connection, table_name: str, column_name: str) -> bool:
    rows = conn.execute(text(f"PRAGMA table_info({table_name})")).all()
    return any(r[1] == column_name for r in rows)


def _ensure_column(
    conn: Connection, table_name: str, column_name: str, ddl_type: str
) -> None:
    if _table_exists(conn, table_name) and not _column_exists(
        conn, table_name, column_name
    ):
        conn.execute(
            text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl_type}")
        )


def _migration_v1(conn: Connection) -> None:
    # Compatibilità idempotente per DB pre-versionamento (es. migrati da feynos.db)
    _ensure_column(conn, "exam", "web_context_summary", "TEXT")
    _ensure_column(conn, "topic", "prerequisites_json", "TEXT NOT NULL DEFAULT '[]'")
    _ensure_column(conn, "topic", "source_pages_json", "TEXT NOT NULL DEFAULT '[]'")
    _ensure_column(conn, "topic", "notes_markdown", "TEXT")
    _ensure_column(conn, "topic", "highlights_json", "TEXT NOT NULL DEFAULT '[]'")
    _ensure_column(conn, "topic", "web_sources_json", "TEXT NOT NULL DEFAULT '[]'")
    _ensure_column(conn, "topic", "mastery_score", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "flashcard", "source_ref_json", "TEXT NOT NULL DEFAULT '{}'")
    _ensure_column(conn, "flashcard", "origin", "TEXT NOT NULL DEFAULT 'SYNTHESIZER'")

    conn.execute(
        text(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS documentchunk_fts
            USING fts5(
                chunk_id UNINDEXED,
                exam_id UNINDEXED,
                document_id UNINDEXED,
                page_number UNINDEXED,
                text,
                tokenize='unicode61 remove_diacritics 2'
            )
            """
        )
    )
    fts_count = conn.execute(
        text("SELECT COUNT(*) FROM documentchunk_fts")
    ).scalar_one()
    if fts_count == 0 and _table_exists(conn, "documentchunk"):
        conn.execute(
            text(
                """
                INSERT INTO documentchunk_fts (chunk_id, exam_id, document_id, page_number, text)
                SELECT dc.id, d.exam_id, dc.document_id, dc.page_number, dc.text
                FROM documentchunk dc
                JOIN document d ON d.id = dc.document_id
                """
            )
        )
def _migration_v2(conn: Connection) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS documentchunk_vec (
                chunk_id TEXT PRIMARY KEY,
                exam_id TEXT NOT NULL,
                model TEXT NOT NULL,
                vector_json TEXT NOT NULL
            )
            """
        )
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_documentchunk_vec_exam_id ON documentchunk_vec (exam_id)"
        )
    )

def _migration_v3(conn: Connection) -> None:
    _ensure_column(conn, "exam", "syllabus_guidance", "TEXT")
    _ensure_column(conn, "topic", "excluded", "INTEGER NOT NULL DEFAULT 0")

def _migration_v4(conn: Connection) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS studyactivitylog (
                id TEXT PRIMARY KEY,
                exam_id TEXT NOT NULL REFERENCES exam(id),
                activity_type TEXT NOT NULL DEFAULT 'FSRS_REVIEW',
                created_at TEXT NOT NULL
            )
            """
        )
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_studyactivitylog_exam_id ON studyactivitylog (exam_id)"
        )
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_studyactivitylog_created_at ON studyactivitylog (created_at)"
        )
    )

def _migration_v5(conn: Connection) -> None:
    # Le tabelle topichighlight e tutormessage sono nuove e vengono create da
    # SQLModel.metadata.create_all; qui serve solo la colonna aggiunta a topic.
    _ensure_column(conn, "topic", "feynman_draft", "TEXT")


MIGRATIONS: list[tuple[int, Callable[[Connection], None]]] = [
    (1, _migration_v1),
    (2, _migration_v2),
    (3, _migration_v3),
    (4, _migration_v4),
    (5, _migration_v5),
]


def init_db() -> None:
    db_path = settings.db_path
    had_existing_tables = False
    current_version = 0

    if db_path.exists() and db_path.stat().st_size > 0:
        with engine.connect() as conn:
            current_version = int(
                conn.execute(text("PRAGMA user_version")).scalar_one() or 0
            )
            had_existing_tables = (
                conn.execute(
                    text(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                    )
                ).scalar_one()
                > 0
            )

    if had_existing_tables and current_version < LATEST_SCHEMA_VERSION:
        create_db_backup(reason=f"pre_v{LATEST_SCHEMA_VERSION}", keep=5)

    SQLModel.metadata.create_all(engine)

    with engine.begin() as conn:
        for version, migrate_fn in MIGRATIONS:
            if current_version < version:
                migrate_fn(conn)
                conn.execute(text(f"PRAGMA user_version = {int(version)}"))
                current_version = version

    _ensure_daily_backup(keep=5)


def get_session():
    with Session(engine) as session:
        yield session