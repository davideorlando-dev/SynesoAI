from sqlmodel import Session, select

import app.agents.mock_exam as mock_mod
import app.api.study as study_api
from app.agents.mock_exam import (
    MockExamGenerationResult,
    MockExamGradingResult,
    MockQuestionSchema,
    PointCheckSchema,
    PointStatus,
    QuestionFeedbackSchema,
    generate_mock_exam,
    grade_mock_exam,
)
from app.db.models import Document, DocumentChunk, Exam, Flashcard, Topic, TopicPriority


def test_mock_exam_forces_exact_30_points_and_deterministic_grading(isolated_env, monkeypatch):
    with Session(isolated_env["engine"]) as s:
        ex = Exam(title="Finanza")
        s.add(ex)
        s.flush()
        doc = Document(exam_id=ex.id, filename="fin.pdf", file_path="fin.pdf", page_count=2)
        s.add(doc)
        s.flush()
        s.add(DocumentChunk(document_id=doc.id, page_number=1, chunk_index=0, text="CAPM e frontiera efficiente."))
        t1 = Topic(exam_id=ex.id, title="CAPM", description="Modello", priority=TopicPriority.CORE)
        t2 = Topic(exam_id=ex.id, title="WACC", description="Costo capitale", priority=TopicPriority.IMPORTANT)
        s.add(t1)
        s.add(t2)
        s.commit()

        bad_gen = MockExamGenerationResult(
            questions=[
                MockQuestionSchema(id="Q1", topic_id=t1.id, topic_title="CAPM", question="Cos'e beta?", expected_points=["Rischio sistematico", "Covarianza"], max_points=10),
                MockQuestionSchema(id="Q2", topic_id=t2.id, topic_title="WACC", question="Formula WACC?", expected_points=["Equity", "Debito"], max_points=10),
                MockQuestionSchema(id="Q3", topic_id=t1.id, topic_title="CAPM", question="SML?", expected_points=["Rendimenti attesi"], max_points=10),
                MockQuestionSchema(id="Q4", topic_id=t2.id, topic_title="WACC", question="Scudo fiscale?", expected_points=["Tasse"], max_points=10),
            ]
        )
        monkeypatch.setattr(mock_mod, "call_llm_structured", lambda *a, **k: bad_gen)
        gen = generate_mock_exam(s, ex, question_count=4)
        assert sum(q.max_points for q in gen.questions) == 30

        # Il modello ricopia i punti attesi, come il prompt gli chiede: una
        # verifica per punto, con lo stesso testo. Prima questo blocco usava
        # nomi inventati e passava solo grazie all'abbinamento per posizione.
        def _checks(question, last_missing: bool = False):
            statuses = [PointStatus.COVERED] * len(question.expected_points)
            if last_missing and statuses:
                statuses[-1] = PointStatus.MISSING
            return [
                PointCheckSchema(point=point, status=status)
                for point, status in zip(question.expected_points, statuses, strict=True)
            ]

        fake_grade = MockExamGradingResult(
            score_30=0,
            passed=False,
            overall_feedback="Buona prova",
            question_feedback=[
                QuestionFeedbackSchema(
                    question_id=question.id,
                    point_checks=_checks(question, last_missing=(index == 0)),
                    score=999,
                    max_score=999,
                    model_answer="...",
                )
                for index, question in enumerate(gen.questions)
            ],
        )
        monkeypatch.setattr(mock_mod, "call_llm_structured", lambda *a, **k: fake_grade)
        # Le risposte vanno passate: senza di esse il compito è in bianco e
        # vale zero, qualunque cosa dica il modello. Qui si verifica che il
        # voto sia calcolato dalla rubrica, non che un foglio vuoto passi.
        answers = {q.id: f"Risposta a {q.id}." for q in gen.questions}
        graded = grade_mock_exam(s, ex, [q.model_dump() for q in gen.questions], answers)
        assert graded.question_feedback[0].max_score == gen.questions[0].max_points
        assert sum(qf.max_score for qf in graded.question_feedback) == 30
        assert graded.score_30 >= 18 and graded.passed is True


def test_interrupted_stream_does_not_corrupt_existing_notes_or_cards(client, isolated_env, monkeypatch):
    with Session(isolated_env["engine"]) as s:
        ex = Exam(title="Analisi")
        s.add(ex)
        s.flush()
        doc = Document(exam_id=ex.id, filename="a.pdf", file_path="a.pdf", page_count=2)
        s.add(doc)
        s.flush()
        s.add(DocumentChunk(document_id=doc.id, page_number=1, chunk_index=0, text="Teorema di Weierstrass."))
        topic = Topic(
            exam_id=ex.id,
            title="Limiti",
            description="Limiti",
            notes_markdown="## Appunti originali intatti",
        )
        s.add(topic)
        s.flush()
        s.add(Flashcard(exam_id=ex.id, topic_id=topic.id, front="Q1", back="A1", origin="SYNTHESIZER", fsrs_card_json="{}"))
        s.commit()
        tid = topic.id

    def _broken_stream(*args, **kwargs):
        yield "## Bozza parziale..."
        raise RuntimeError("Connessione Groq interrotta a metà!")

    monkeypatch.setattr(study_api, "stream_topic_notes_from_context", _broken_stream)

    res = client.post(f"/api/study/topics/{tid}/synthesize-stream?force=true")
    assert res.status_code == 200
    assert '"type": "error"' in res.text

    with Session(isolated_env["engine"]) as s:
        tp = s.get(Topic, tid)
        assert tp.notes_markdown == "## Appunti originali intatti"
        cards = s.exec(select(Flashcard).where(Flashcard.topic_id == tid)).all()
        assert len(cards) == 1 and cards[0].front == "Q1"
