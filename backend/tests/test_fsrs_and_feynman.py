from datetime import date, timedelta
from sqlmodel import Session

import app.agents.feynman as feynman_mod
from app.agents.feynman import (
    FeynmanEvaluationResult,
    RubricCriterionSchema,
    RubricStatus,
    evaluate_feynman_explanation,
)
from app.core.fsrs_engine import (
    compute_exam_retention_pct,
    create_new_fsrs_card_json,
    preview_fsrs_intervals,
    review_fsrs_card,
)
from app.db.models import Document, DocumentChunk, Exam, Topic


def test_fsrs_caps_due_date_before_exam_and_previews_do_not_crash():
    exam_dt = date.today() + timedelta(days=3)
    card_json = create_new_fsrs_card_json()

    previews = preview_fsrs_intervals(card_json, exam_date=exam_dt, lang="it")
    assert set(previews.keys()) == {"1", "2", "3", "4"}
    assert all(v for v in previews.values())

    updated_json, due_utc = review_fsrs_card(card_json, rating_value=4, exam_date=exam_dt)
    assert due_utc.date() <= exam_dt

    ret, count = compute_exam_retention_pct([card_json, updated_json], exam_date=exam_dt)
    assert count == 1
    assert ret is not None and 0 <= ret <= 100


def test_feynman_critical_missing_pillar_blocks_passing_even_over_75(isolated_env, monkeypatch):
    with Session(isolated_env["engine"]) as s:
        ex = Exam(title="Diritto")
        s.add(ex)
        s.flush()
        doc = Document(exam_id=ex.id, filename="test.pdf", file_path="test.pdf", page_count=4)
        s.add(doc)
        s.flush()
        s.add(DocumentChunk(document_id=doc.id, page_number=2, chunk_index=0, text="Testo di prova."))
        topic = Topic(exam_id=ex.id, title="Nullità", description="Test", source_pages_json=f'[{{"doc_id": "{doc.id}", "page": 2}}]')
        s.add(topic)
        s.commit()

        fake_eval = FeynmanEvaluationResult(
            rubric=[
                RubricCriterionSchema(concept="C1", weight=2, status=RubricStatus.COVERED, evidence="ok", doc_index=1, source_page=2),
                RubricCriterionSchema(concept="C2", weight=2, status=RubricStatus.COVERED, evidence="ok", doc_index=1, source_page=2),
                RubricCriterionSchema(concept="C3", weight=2, status=RubricStatus.COVERED, evidence="ok", doc_index=1, source_page=2),
                RubricCriterionSchema(concept="C4", weight=2, status=RubricStatus.COVERED, evidence="ok", doc_index=1, source_page=2),
                RubricCriterionSchema(concept="C5", weight=2, status=RubricStatus.COVERED, evidence="ok", doc_index=1, source_page=2),
                RubricCriterionSchema(concept="Pilastro Critico", weight=3, status=RubricStatus.MISSING, evidence="assente", doc_index=1, source_page=99),
            ],
            mastery_score=80,
            passed=True,
            understood_points=[],
            missing_or_wrong=[],
            socratic_followup="Spiega il pilastro critico.",
        )
        monkeypatch.setattr(feynman_mod, "call_llm_structured", lambda *a, **k: fake_eval)

        res = evaluate_feynman_explanation(s, topic, "La mia spiegazione lunga almeno 5 caratteri")
        assert res.mastery_score == 77
        assert res.passed is False
        assert res.rubric[-1].source_page is None
