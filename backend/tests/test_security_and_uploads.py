from sqlmodel import Session

from app.db.models import Document, Exam
from tests.conftest import make_pdf_bytes


def test_origin_guard_blocks_external_mutations(client):
    res = client.post(
        "/api/settings",
        json={"llm_model": "openai/gpt-oss-20b"},
        headers={"Origin": "https://evil.example"},
    )
    assert res.status_code == 403

    ok = client.post(
        "/api/settings",
        json={"llm_model": "openai/gpt-oss-20b"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert ok.status_code == 200


def test_settings_validation_and_key_masking(client):
    assert client.post("/api/settings", json={"groq_api_key": "abc"}).status_code == 400
    assert client.post("/api/settings", json={"groq_api_key": "gsk_1234567890\nEVIL=1"}).status_code == 400
    assert client.post("/api/settings", json={"llm_model": "bad model!;"}).status_code == 400

    res = client.post("/api/settings", json={"groq_api_key": "gsk_abcdef1234567890"})
    assert res.status_code == 200
    body = res.json()
    assert body["has_api_key"] is True
    assert "1234567890" not in body["api_key_masked"]
    assert body["api_key_masked"].startswith("gsk_ab")


def test_upload_rejects_invalid_extensions_magic_bytes_and_encrypted_pdfs(client):
    r_ext = client.post(
        "/api/exams/",
        data={"title": "Test"},
        files={"files": ("malware.exe", b"MZ...", "application/octet-stream")},
    )
    assert r_ext.status_code == 400

    r_fake_pdf = client.post(
        "/api/exams/",
        data={"title": "Test"},
        files={"files": ("fake.pdf", b"NOT_A_PDF_HEADER", "application/pdf")},
    )
    assert r_fake_pdf.status_code == 400

    r_fake_png = client.post(
        "/api/exams/",
        data={"title": "Test"},
        files={"files": ("fake.png", b"JFIF_NOT_PNG", "image/png")},
    )
    assert r_fake_png.status_code == 400

    enc_pdf = make_pdf_bytes(["Secret page"], password="123")
    r_enc = client.post(
        "/api/exams/",
        data={"title": "Test"},
        files={"files": ("locked.pdf", enc_pdf, "application/pdf")},
    )
    assert r_enc.status_code == 400


def test_pdf_serving_blocks_path_traversal(client, isolated_env):
    outside_file = isolated_env["data_dir"].parent / "secret.txt"
    outside_file.write_text("top-secret", encoding="utf-8")

    with Session(isolated_env["engine"]) as s:
        ex = Exam(title="Security Exam")
        s.add(ex)
        s.flush()
        doc = Document(
            exam_id=ex.id,
            filename="../../secret.txt",
            file_path=str(outside_file),
            page_count=1,
        )
        s.add(doc)
        s.commit()
        doc_id = doc.id

    res = client.get(f"/api/exams/documents/{doc_id}/pdf")
    assert res.status_code == 403


def test_cors_preflight_allows_every_method_the_api_uses(client):
    """In sviluppo il frontend (porta 3000) chiama il backend (porta 8000) cross-origin."""
    for method in ("GET", "POST", "PUT", "PATCH", "DELETE"):
        res = client.options(
            "/api/study/topics/any/feynman-draft",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.status_code == 200, method
        assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
