import pytest
from sqlmodel import Session

import app.services.exam_import as exam_import
import app.api.study as study_api
import app.core.llm as llm_mod
from app.config import settings
from app.core.errors import (
    LLMKeyInvalidError,
    LLMKeyMissingError,
    LLMRateLimitedError,
    LLMUpstreamError,
)
from app.db.models import Exam, Topic
from tests.conftest import make_pdf_bytes


class _FakeGroqResponse:
    def __init__(self, status_code: int, message: str = "upstream message"):
        self.status_code = status_code
        self.headers: dict[str, str] = {}
        self._message = message

    def json(self) -> dict:
        return {"error": {"message": self._message}}


def _patch_groq(monkeypatch, status_code: int) -> list[int]:
    calls: list[int] = []

    def _fake_post(*args, **kwargs):
        calls.append(status_code)
        return _FakeGroqResponse(status_code)

    monkeypatch.setattr(settings, "groq_api_key", "gsk_test_key_1234567890")
    monkeypatch.setattr(llm_mod.httpx, "post", _fake_post)
    monkeypatch.setattr(llm_mod.time, "sleep", lambda _seconds: None)
    return calls


def test_missing_api_key_is_reported_before_any_request(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", None)
    monkeypatch.setattr(settings, "llm_api_key", None)

    with pytest.raises(LLMKeyMissingError):
        llm_mod._groq_post_with_retry({"model": "m"})


def test_rejected_api_key_is_not_retried(monkeypatch):
    calls = _patch_groq(monkeypatch, 401)

    with pytest.raises(LLMKeyInvalidError):
        llm_mod._groq_post_with_retry({"model": "m"})
    assert len(calls) == 1


def test_rate_limit_is_retried_then_reported_as_rate_limit(monkeypatch):
    calls = _patch_groq(monkeypatch, 429)

    with pytest.raises(LLMRateLimitedError, match="upstream message"):
        llm_mod._groq_post_with_retry({"model": "m"})
    assert len(calls) == 3


def test_server_failure_is_reported_as_unavailable_not_rate_limit(monkeypatch):
    _patch_groq(monkeypatch, 503)

    with pytest.raises(LLMUpstreamError) as exc_info:
        llm_mod._groq_post_with_retry({"model": "m"})
    assert not isinstance(exc_info.value, LLMRateLimitedError)


def test_llm_error_reaches_the_client_with_status_message_and_code(
    client, isolated_env, monkeypatch
):
    with Session(isolated_env["engine"]) as s:
        exam = Exam(title="Diritto")
        s.add(exam)
        s.flush()
        topic = Topic(exam_id=exam.id, title="Nullità", description="Test")
        s.add(topic)
        s.commit()
        topic_id = topic.id

    def _rate_limited(*args, **kwargs):
        raise LLMRateLimitedError("Limite di richieste raggiunto.")

    monkeypatch.setattr(study_api, "evaluate_feynman_explanation", _rate_limited)

    res = client.post(
        f"/api/study/topics/{topic_id}/feynman",
        json={"explanation": "Una spiegazione sufficientemente lunga"},
    )

    assert res.status_code == 429
    assert res.json() == {
        "detail": "Limite di richieste raggiunto.",
        "code": "llm_rate_limited",
    }


def test_mock_exam_without_active_topics_is_a_conflict_not_a_server_error(
    client, isolated_env
):
    with Session(isolated_env["engine"]) as s:
        exam = Exam(title="Esame vuoto")
        s.add(exam)
        s.commit()
        exam_id = exam.id

    res = client.post(f"/api/study/exams/{exam_id}/mock-exam/generate")

    assert res.status_code == 409
    assert res.json()["code"] == "no_active_topics"


def test_create_exam_keeps_llm_error_code_and_still_cleans_up(
    client, isolated_env, monkeypatch
):
    def _invalid_key(*args, **kwargs):
        raise LLMKeyInvalidError("Chiave API Groq non valida o scaduta.")

    monkeypatch.setattr(exam_import, "map_exam_topics", _invalid_key)

    pdf = make_pdf_bytes(["Capitolo 1: Principi generali del diritto civile."])
    res = client.post(
        "/api/exams/",
        data={"title": "Diritto Civile"},
        files={"files": ("dispensa.pdf", pdf, "application/pdf")},
    )

    assert res.status_code == 400
    assert res.json()["code"] == "llm_key_invalid"
    assert list((isolated_env["data_dir"] / "uploads").glob("*.pdf")) == []


def test_connection_test_keeps_the_error_code(client, monkeypatch):
    import app.main as main_mod

    def _invalid_key(*args, **kwargs):
        raise LLMKeyInvalidError("Chiave API Groq non valida.")

    monkeypatch.setattr(main_mod, "test_groq_connection", _invalid_key)

    res = client.post("/api/settings/test", json={"groq_api_key": "gsk_wrong_key_123456"})

    assert res.status_code == 400
    assert res.json()["code"] == "llm_key_invalid"


def test_unexpected_error_reaches_the_browser_as_an_error_and_not_as_a_network_failure(
    client, monkeypatch
):
    """
    Una risposta d'errore senza intestazioni CORS, per il browser, non è una
    risposta: è un errore di rete, e l'interfaccia non può dire nulla. Il
    middleware che cattura l'imprevisto sta dentro quello CORS proprio per
    questo, e qui si verifica che ci resti.
    """
    import app.main as main_mod

    def _explode():
        raise RuntimeError("qualcosa di non previsto")

    monkeypatch.setattr(main_mod, "health_payload", _explode)

    res = client.get("/health", headers={"Origin": "http://localhost:3000"})

    assert res.status_code == 500
    assert res.json() == {
        "detail": "Errore interno dell'applicazione. Il dettaglio è nel log.",
        "code": "internal_error",
    }
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_missing_exam_is_reported_with_a_code_the_interface_can_translate(client):
    res = client.get("/api/exams/does-not-exist/roadmap")

    assert res.status_code == 404
    assert res.json()["code"] == "exam_not_found"


def test_missing_topic_and_missing_flashcard_have_their_own_codes(client):
    assert (
        client.get("/api/study/topics/does-not-exist/feynman-history").json()["code"]
        == "topic_not_found"
    )
    assert (
        client.post("/api/study/cards/does-not-exist/review", json={"rating": 3}).json()[
            "code"
        ]
        == "flashcard_not_found"
    )
