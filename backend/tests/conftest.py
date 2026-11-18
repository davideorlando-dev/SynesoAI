import os
os.environ["SYNESO_DISABLE_FASTEMBED"] = "1"

import pytest
from fastapi.testclient import TestClient
import pymupdf
from sqlalchemy import event
from sqlmodel import Session, create_engine

import app.api.study as study_api
import app.db.database as db_mod
import app.main as main_mod
from app.config import settings


def make_pdf_bytes(pages: list[str], password: str | None = None) -> bytes:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    if password:
        data = doc.tobytes(
            encryption=pymupdf.PDF_ENCRYPT_AES_256,
            owner_pw=password,
            user_pw=password,
        )
    else:
        data = doc.tobytes()
    doc.close()
    return data


@pytest.fixture()
def isolated_env(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    env_file = tmp_path / ".env"

    monkeypatch.setattr(settings, "data_dir", data_dir)
    monkeypatch.setattr(settings, "log_path", tmp_path / "syneso.log")
    monkeypatch.setattr(settings, "groq_api_key", "gsk_test_key_1234567890")
    monkeypatch.setattr(settings, "enable_web_search", False)
    monkeypatch.setattr(main_mod, "ENV_FILE_PATH", env_file)

    test_engine = create_engine(
        f"sqlite:///{data_dir / 'syneso.db'}",
        connect_args={"check_same_thread": False, "timeout": 15.0},
    )

    @event.listens_for(test_engine, "connect")
    def _on_connect(dbapi_conn, _rec):
        db_mod._configure_sqlite_connection(dbapi_conn, _rec)

    monkeypatch.setattr(db_mod, "engine", test_engine)
    monkeypatch.setattr(study_api, "engine", test_engine)

    def _override_session():
        with Session(test_engine) as s:
            yield s

    main_mod.app.dependency_overrides[db_mod.get_session] = _override_session
    db_mod.init_db()

    yield {"data_dir": data_dir, "env_file": env_file, "engine": test_engine}

    main_mod.app.dependency_overrides.clear()
    test_engine.dispose()


@pytest.fixture()
def client(isolated_env):
    with TestClient(main_mod.app) as c:
        yield c
