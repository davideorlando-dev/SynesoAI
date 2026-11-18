from sqlmodel import Session, select

import app.api.study as study_api
from app.agents.feynman import FeynmanEvaluationResult
from app.agents.synthesizer import TutorAnswerResult
from app.db.models import Exam, Topic, TopicHighlight, TutorMessage


def _make_exam_with_topics(engine, topic_titles: list[str]) -> tuple[str, list[str]]:
    with Session(engine) as s:
        exam = Exam(title="Diritto Privato")
        s.add(exam)
        s.flush()
        topics = [Topic(exam_id=exam.id, title=t, description=t) for t in topic_titles]
        for topic in topics:
            s.add(topic)
        s.commit()
        return exam.id, [t.id for t in topics]


def _fake_tutor(monkeypatch, answer: str = "Risposta del tutor") -> None:
    monkeypatch.setattr(
        study_api,
        "answer_topic_question",
        lambda *a, **k: (TutorAnswerResult(answer_markdown=answer, citations=[]), {}),
    )


def test_highlights_are_stored_normalised_and_one_per_passage(client, isolated_env):
    exam_id, (topic_id,) = _make_exam_with_topics(isolated_env["engine"], ["Nullità"])

    first = client.post(
        f"/api/study/topics/{topic_id}/highlights",
        json={"text": "  la nullità\n  è   insanabile ", "color": "yellow"},
    )
    assert first.status_code == 200
    assert first.json()["highlight"]["text"] == "la nullità è insanabile"

    recoloured = client.post(
        f"/api/study/topics/{topic_id}/highlights",
        json={"text": "la nullità è insanabile", "color": "blue"},
    )
    assert recoloured.json()["highlight"]["id"] == first.json()["highlight"]["id"]

    annotations = client.get(f"/api/study/exams/{exam_id}/annotations").json()
    assert annotations["highlights"] == {
        topic_id: [
            {
                "id": first.json()["highlight"]["id"],
                "text": "la nullità è insanabile",
                "color": "blue",
            }
        ]
    }

    deleted = client.delete(f"/api/study/highlights/{first.json()['highlight']['id']}")
    assert deleted.status_code == 200
    assert client.get(f"/api/study/exams/{exam_id}/annotations").json()["highlights"] == {}


def test_highlight_validation_rejects_bad_input(client, isolated_env):
    _, (topic_id,) = _make_exam_with_topics(isolated_env["engine"], ["Nullità"])

    assert client.post(
        f"/api/study/topics/{topic_id}/highlights", json={"text": "ab"}
    ).status_code == 422
    assert client.post(
        f"/api/study/topics/{topic_id}/highlights",
        json={"text": "testo valido", "color": "purple"},
    ).status_code == 422
    assert client.post(
        "/api/study/topics/missing/highlights", json={"text": "testo valido"}
    ).status_code == 404


def test_tutor_answers_are_persisted_and_clearing_the_chat_is_permanent(
    client, isolated_env, monkeypatch
):
    exam_id, (topic_id,) = _make_exam_with_topics(isolated_env["engine"], ["Nullità"])
    _fake_tutor(monkeypatch)

    asked = client.post(
        f"/api/study/topics/{topic_id}/ask",
        json={"question": "Cos'è la nullità?", "selected_text": "passaggio"},
    )
    assert asked.status_code == 200

    thread = client.get(f"/api/study/exams/{exam_id}/annotations").json()["tutor_threads"]
    assert thread == {
        topic_id: [
            {
                "id": asked.json()["id"],
                "question": "Cos'è la nullità?",
                "selected_text": "passaggio",
                "answer_markdown": "Risposta del tutor",
                "citations": [],
            }
        ]
    }

    assert client.delete(f"/api/study/topics/{topic_id}/tutor-messages").status_code == 200
    assert (
        client.get(f"/api/study/exams/{exam_id}/annotations").json()["tutor_threads"] == {}
    )


def test_feynman_draft_is_saved_and_cleared_once_submitted(
    client, isolated_env, monkeypatch
):
    _, (topic_id,) = _make_exam_with_topics(isolated_env["engine"], ["Nullità"])

    saved = client.put(
        f"/api/study/topics/{topic_id}/feynman-draft", json={"text": "La mia bozza"}
    )
    assert saved.status_code == 200
    history = client.get(f"/api/study/topics/{topic_id}/feynman-history").json()
    assert history == {"session": None, "draft": "La mia bozza"}

    monkeypatch.setattr(
        study_api,
        "evaluate_feynman_explanation",
        lambda *a, **k: FeynmanEvaluationResult(
            mastery_score=40,
            passed=False,
            understood_points=[],
            missing_or_wrong=[],
            socratic_followup="Approfondisci.",
        ),
    )
    submitted = client.post(
        f"/api/study/topics/{topic_id}/feynman", json={"explanation": "La mia bozza"}
    )
    assert submitted.status_code == 200
    assert client.get(f"/api/study/topics/{topic_id}/feynman-history").json()["draft"] == ""


def test_legacy_import_is_repeatable_and_ignores_other_exams(client, isolated_env):
    exam_id, (topic_id,) = _make_exam_with_topics(isolated_env["engine"], ["Nullità"])
    _, (foreign_topic_id,) = _make_exam_with_topics(isolated_env["engine"], ["Altro"])

    payload = {
        "highlights": {
            topic_id: [{"text": "passaggio importante", "color": "green"}],
            foreign_topic_id: [{"text": "non mio", "color": "pink"}],
        },
        "tutor_threads": {
            topic_id: [{"question": "Domanda?", "answer_markdown": "Risposta."}],
        },
        "feynman_drafts": {topic_id: "Bozza salvata", foreign_topic_id: "Bozza altrui"},
    }

    first = client.post(f"/api/study/exams/{exam_id}/annotations/import", json=payload)
    assert first.status_code == 200
    assert first.json() == {"highlights": 1, "tutor_messages": 1, "feynman_drafts": 1}

    second = client.post(f"/api/study/exams/{exam_id}/annotations/import", json=payload)
    assert second.json()["tutor_messages"] == 0
    assert second.json()["feynman_drafts"] == 0

    with Session(isolated_env["engine"]) as s:
        assert len(s.exec(select(TopicHighlight)).all()) == 1
        assert len(s.exec(select(TutorMessage)).all()) == 1
        assert s.get(Topic, foreign_topic_id).feynman_draft is None
        assert s.get(Topic, topic_id).feynman_draft == "Bozza salvata"


def test_deleting_an_exam_removes_its_annotations(client, isolated_env, monkeypatch):
    exam_id, (topic_id,) = _make_exam_with_topics(isolated_env["engine"], ["Nullità"])
    _fake_tutor(monkeypatch)
    client.post(f"/api/study/topics/{topic_id}/highlights", json={"text": "da eliminare"})
    client.post(f"/api/study/topics/{topic_id}/ask", json={"question": "Domanda?"})

    assert client.delete(f"/api/exams/{exam_id}").status_code == 200

    with Session(isolated_env["engine"]) as s:
        assert s.exec(select(TopicHighlight)).all() == []
        assert s.exec(select(TutorMessage)).all() == []
