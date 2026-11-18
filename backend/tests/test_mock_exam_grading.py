import pytest
from sqlmodel import Session

import app.agents.mock_exam as mock_mod
from app.agents.mock_exam import (
    GradedQuestionSpec,
    MockExamGradingResult,
    PointCheckSchema,
    PointStatus,
    QuestionFeedbackSchema,
    align_point_checks,
    apply_deterministic_grade,
    grading_token_budget,
    resolve_question_id,
)
from app.core.llm import MAX_COMPLETION_TOKENS, THINKING_MAX_TOKENS
from app.db.models import Exam


def _spec(qid: str, max_points: int = 10, answered: bool = True) -> GradedQuestionSpec:
    return GradedQuestionSpec(
        question_id=qid,
        max_points=max_points,
        expected_points=("P1", "P2"),
        answered=answered,
    )


def _feedback(qid: str, *statuses: PointStatus) -> QuestionFeedbackSchema:
    return QuestionFeedbackSchema(
        question_id=qid,
        point_checks=[
            PointCheckSchema(point=f"P{i}", status=st)
            for i, st in enumerate(statuses, start=1)
        ],
        score=999,
        max_score=999,
        model_answer="...",
    )


def _result(*feedback: QuestionFeedbackSchema) -> MockExamGradingResult:
    return MockExamGradingResult(
        score_30=30,
        passed=True,
        overall_feedback="ok",
        question_feedback=list(feedback),
    )


def test_blank_question_skipped_by_model_counts_as_zero_instead_of_being_ignored():
    specs = [_spec("Q1"), _spec("Q2"), _spec("Q3", answered=False)]
    res = _result(
        _feedback("Q1", PointStatus.COVERED, PointStatus.COVERED),
        _feedback("Q2", PointStatus.COVERED, PointStatus.COVERED),
    )

    apply_deterministic_grade(res, specs)

    assert [qf.question_id for qf in res.question_feedback] == ["Q1", "Q2", "Q3"]
    assert res.question_feedback[2].score == 0
    assert res.question_feedback[2].missing == ["P1", "P2"]
    assert res.score_30 == 20
    assert res.passed is True


def test_blank_question_scores_zero_even_if_the_model_marks_every_point_covered():
    """Il foglio bianco lo conosce l'applicazione: il giudizio del modello non lo copre."""
    specs = [_spec("Q1", max_points=15), _spec("Q2", max_points=15, answered=False)]
    res = _result(
        _feedback("Q1", PointStatus.COVERED, PointStatus.COVERED),
        _feedback("Q2", PointStatus.COVERED, PointStatus.COVERED),
    )

    apply_deterministic_grade(res, specs)

    assert [qf.score for qf in res.question_feedback] == [15, 0]
    blank = res.question_feedback[1]
    assert [pc.status for pc in blank.point_checks] == [PointStatus.MISSING] * 2
    assert blank.strengths == []
    assert blank.missing == ["P1", "P2"]
    assert res.score_30 == 15
    assert res.passed is False


def test_blank_question_gets_no_credit_for_a_claimed_relevant_attempt():
    specs = [_spec("Q1", answered=False)]
    feedback = _feedback("Q1", PointStatus.PARTIAL, PointStatus.PARTIAL)
    feedback.relevant_attempt = True
    res = _result(feedback)

    apply_deterministic_grade(res, specs)

    assert res.question_feedback[0].score == 0
    assert res.question_feedback[0].relevant_attempt is False


def test_answered_question_without_feedback_is_an_incomplete_grading():
    specs = [_spec("Q1"), _spec("Q2")]
    res = _result(_feedback("Q1", PointStatus.COVERED, PointStatus.COVERED))

    with pytest.raises(RuntimeError, match="Q2"):
        apply_deterministic_grade(res, specs)


def test_unknown_and_duplicate_feedback_cannot_change_the_grade():
    specs = [_spec("Q1", max_points=15), _spec("Q2", max_points=15)]
    res = _result(
        _feedback("Q1", PointStatus.MISSING, PointStatus.MISSING),
        _feedback("Q1", PointStatus.COVERED, PointStatus.COVERED),
        _feedback("Q99", PointStatus.COVERED, PointStatus.COVERED),
        _feedback("Q2", PointStatus.PARTIAL, PointStatus.COVERED),
    )

    apply_deterministic_grade(res, specs)

    assert [qf.question_id for qf in res.question_feedback] == ["Q1", "Q2"]
    assert [qf.max_score for qf in res.question_feedback] == [15, 15]
    assert [qf.score for qf in res.question_feedback] == [0, 11]
    assert res.score_30 == 11
    assert res.passed is False


def test_no_questions_yields_zero_and_not_the_model_grade():
    res = _result()

    apply_deterministic_grade(res, [])

    assert res.score_30 == 0
    assert res.passed is False


def test_grading_budget_grows_with_the_number_of_questions_up_to_the_cap():
    assert grading_token_budget(6) > THINKING_MAX_TOKENS
    assert grading_token_budget(3) < grading_token_budget(6)
    assert grading_token_budget(50) == MAX_COMPLETION_TOKENS


def _questions(*qids: str) -> list[dict]:
    return [
        {
            "id": qid,
            "topic_id": "t1",
            "question": f"Domanda {qid}",
            "expected_points": ["P1", "P2"],
            "max_points": 10,
        }
        for qid in qids
    ]


def test_questions_skipped_by_the_model_are_requested_again_on_their_own(
    isolated_env, monkeypatch
):
    calls: list[dict] = []

    def _fake_llm(system_prompt, user_prompt, schema, think=None, max_tokens=None):
        calls.append({"prompt": user_prompt, "max_tokens": max_tokens})
        if len(calls) == 1:
            return _result(
                _feedback("Q1", PointStatus.COVERED, PointStatus.COVERED),
                _feedback("Q3", PointStatus.COVERED, PointStatus.MISSING),
            )
        return _result(_feedback("Q2", PointStatus.PARTIAL, PointStatus.PARTIAL))

    monkeypatch.setattr(mock_mod, "call_llm_structured", _fake_llm)

    with Session(isolated_env["engine"]) as session:
        res = mock_mod.grade_mock_exam(
            session,
            Exam(title="Diritto"),
            _questions("Q1", "Q2", "Q3"),
            {"Q1": "risposta", "Q2": "risposta", "Q3": "risposta"},
        )

    assert len(calls) == 2
    assert "=== Q2 " in calls[1]["prompt"]
    assert "=== Q1 " not in calls[1]["prompt"]
    assert calls[1]["max_tokens"] < calls[0]["max_tokens"]
    assert [qf.question_id for qf in res.question_feedback] == ["Q1", "Q2", "Q3"]
    assert [qf.score for qf in res.question_feedback] == [10, 5, 5]
    assert res.score_30 == 20


def test_grading_fails_when_a_question_is_still_missing_after_the_second_request(
    isolated_env, monkeypatch
):
    calls: list[str] = []

    def _fake_llm(system_prompt, user_prompt, schema, think=None, max_tokens=None):
        calls.append(user_prompt)
        return _result(_feedback("Q1", PointStatus.COVERED, PointStatus.COVERED))

    monkeypatch.setattr(mock_mod, "call_llm_structured", _fake_llm)

    with Session(isolated_env["engine"]) as session, pytest.raises(RuntimeError, match="Q2"):
        mock_mod.grade_mock_exam(
            session,
            Exam(title="Diritto"),
            _questions("Q1", "Q2"),
            {"Q1": "risposta", "Q2": "risposta"},
        )

    assert len(calls) == 2


def _missing_everything(qid: str, relevant_attempt: bool) -> QuestionFeedbackSchema:
    feedback = _feedback(qid, PointStatus.MISSING, PointStatus.MISSING)
    feedback.relevant_attempt = relevant_attempt
    return feedback


def test_pertinent_but_incomplete_answer_gets_one_point_instead_of_zero():
    specs = [_spec("Q1", max_points=5), _spec("Q2", max_points=5)]
    res = _result(
        _missing_everything("Q1", relevant_attempt=True),
        _missing_everything("Q2", relevant_attempt=False),
    )

    apply_deterministic_grade(res, specs)

    assert [qf.score for qf in res.question_feedback] == [1, 0]


def test_blank_answer_never_gets_the_relevant_attempt_point():
    specs = [_spec("Q1", max_points=5, answered=False)]
    res = _result(_missing_everything("Q1", relevant_attempt=True))

    apply_deterministic_grade(res, specs)

    assert res.question_feedback[0].score == 0
    assert res.question_feedback[0].relevant_attempt is False


def test_relevant_attempt_point_does_not_add_to_an_answer_that_already_scored():
    specs = [_spec("Q1", max_points=10)]
    feedback = _feedback("Q1", PointStatus.COVERED, PointStatus.MISSING)
    feedback.relevant_attempt = True
    res = _result(feedback)

    apply_deterministic_grade(res, specs)

    assert res.question_feedback[0].score == 5


def test_half_points_round_up_in_favour_of_the_student():
    specs = [_spec("Q1", max_points=5)]
    res = _result(_feedback("Q1", PointStatus.PARTIAL, PointStatus.PARTIAL))

    apply_deterministic_grade(res, specs)

    assert res.question_feedback[0].score == 3


def test_model_variants_of_a_question_id_resolve_to_the_question_asked():
    specs = [
        GradedQuestionSpec("Q1", 5, ("P1",), True, topic_id="topic-a"),
        GradedQuestionSpec("Q2", 5, ("P1",), True, topic_id="topic-b"),
        GradedQuestionSpec("Q10", 5, ("P1",), True, topic_id="topic-b"),
    ]

    assert resolve_question_id("Q1", specs) == "Q1"
    assert resolve_question_id(" q2 ", specs) == "Q2"
    assert resolve_question_id("Q1 (topic_id=topic-a | max_points=5)", specs) == "Q1"
    assert resolve_question_id("=== Q10 ===", specs) == "Q10"
    assert resolve_question_id("Domanda 2", specs) == "Q2"
    assert resolve_question_id("1", specs) == "Q1"
    assert resolve_question_id("topic-a", specs) == "Q1"
    # ambiguo o sconosciuto: non si indovina
    assert resolve_question_id("topic-b", specs) is None
    assert resolve_question_id("Q7", specs) is None
    assert resolve_question_id("risposta", specs) is None


def test_grading_accepts_ids_the_model_rewrote_without_a_second_request(
    isolated_env, monkeypatch
):
    calls: list[str] = []

    def _fake_llm(system_prompt, user_prompt, schema, think=None, max_tokens=None):
        calls.append(user_prompt)
        return _result(
            _feedback("Domanda 1", PointStatus.COVERED, PointStatus.COVERED),
            _feedback("q2", PointStatus.COVERED, PointStatus.COVERED),
            _feedback("Q3 (topic_id=t1 | max_points=10)", PointStatus.COVERED, PointStatus.COVERED),
        )

    monkeypatch.setattr(mock_mod, "call_llm_structured", _fake_llm)

    with Session(isolated_env["engine"]) as session:
        res = mock_mod.grade_mock_exam(
            session,
            Exam(title="Diritto"),
            _questions("Q1", "Q2", "Q3"),
            {"Q1": "risposta", "Q2": "risposta", "Q3": "risposta"},
        )

    assert len(calls) == 1
    assert [qf.question_id for qf in res.question_feedback] == ["Q1", "Q2", "Q3"]
    assert res.score_30 == 30


def test_unrecognisable_ids_are_matched_by_order_only_when_one_answer_per_question(
    isolated_env, monkeypatch
):
    def _fake_llm(system_prompt, user_prompt, schema, think=None, max_tokens=None):
        return _result(
            _feedback("prima", PointStatus.COVERED, PointStatus.COVERED),
            _feedback("seconda", PointStatus.MISSING, PointStatus.MISSING),
        )

    monkeypatch.setattr(mock_mod, "call_llm_structured", _fake_llm)

    with Session(isolated_env["engine"]) as session:
        res = mock_mod.grade_mock_exam(
            session,
            Exam(title="Diritto"),
            _questions("Q1", "Q2"),
            {"Q1": "risposta", "Q2": "risposta"},
        )

    assert [(qf.question_id, qf.score) for qf in res.question_feedback] == [("Q1", 10), ("Q2", 0)]


def _spec_with(points: tuple[str, ...], max_points: int = 10) -> GradedQuestionSpec:
    return GradedQuestionSpec(
        question_id="Q1", max_points=max_points, expected_points=points, answered=True
    )


def _checks(*pairs: tuple[str, PointStatus]) -> list[PointCheckSchema]:
    return [PointCheckSchema(point=point, status=status) for point, status in pairs]


def _graded(spec: GradedQuestionSpec, checks: list[PointCheckSchema]):
    feedback = QuestionFeedbackSchema(
        question_id=spec.question_id,
        point_checks=checks,
        score=999,
        max_score=999,
        model_answer="...",
    )
    res = _result(feedback)
    apply_deterministic_grade(res, [spec])
    return res.question_feedback[0]


def test_extra_and_invented_point_checks_cannot_raise_the_grade():
    spec = _spec_with(("Definizione di nullità", "Effetti sul contratto"))

    graded = _graded(
        spec,
        _checks(
            ("Definizione di nullità", PointStatus.COVERED),
            ("Effetti sul contratto", PointStatus.MISSING),
            ("Un punto che nessuno ha chiesto", PointStatus.COVERED),
            ("E un altro ancora", PointStatus.COVERED),
        ),
    )

    assert [pc.point for pc in graded.point_checks] == list(spec.expected_points)
    assert graded.score == 5


def test_missing_point_checks_count_as_missing_instead_of_shrinking_the_rubric():
    spec = _spec_with(("Primo punto", "Secondo punto", "Terzo punto"), max_points=9)

    # Il modello valuta un solo punto su tre: prima valeva 9/9, ora 3/9.
    graded = _graded(spec, _checks(("Primo punto", PointStatus.COVERED)))

    assert [pc.status for pc in graded.point_checks] == [
        PointStatus.COVERED,
        PointStatus.MISSING,
        PointStatus.MISSING,
    ]
    assert graded.score == 3


def test_no_point_checks_at_all_scores_zero_and_ignores_the_model_number():
    spec = _spec_with(("Primo punto", "Secondo punto"))

    graded = _graded(spec, [])

    assert graded.score == 0
    assert [pc.status for pc in graded.point_checks] == [
        PointStatus.MISSING,
        PointStatus.MISSING,
    ]


def test_points_the_model_reworded_are_still_recognised():
    spec = _spec_with(("Definizione di nullità", "Effetti sul contratto"))

    graded = _graded(
        spec,
        _checks(
            ("effetti sul contratto", PointStatus.COVERED),
            ("La definizione di nullità, in breve", PointStatus.COVERED),
        ),
    )

    assert graded.score == 10


def test_unrecognisable_point_names_are_not_credited():
    """
    Prima questo test fissava l'abbinamento per posizione: due verifiche
    illeggibili prendevano i due punti attesi nell'ordine, e la prima li
    copriva. Ora quelle verifiche non dicono nulla su nessun punto.
    """
    spec = _spec_with(("Primo punto", "Secondo punto"))

    graded = _graded(
        spec,
        _checks(("aaa", PointStatus.COVERED), ("bbb", PointStatus.MISSING)),
    )

    assert [pc.point for pc in graded.point_checks] == list(spec.expected_points)
    assert [pc.status for pc in graded.point_checks] == [PointStatus.MISSING] * 2
    assert graded.score == 0


def test_points_the_model_did_not_assess_are_missing_and_not_credited_by_position():
    """
    Il caso che l'abbinamento per posizione sbagliava: due verifiche su
    tutt'altro finivano sui due punti attesi e li coprivano entrambi.
    """
    aligned = align_point_checks(
        _checks(("Il vento", PointStatus.COVERED), ("Le maree", PointStatus.COVERED)),
        ("Rotta vera", "Velocità effettiva"),
    )

    assert [pc.point for pc in aligned] == ["Rotta vera", "Velocità effettiva"]
    assert [pc.status for pc in aligned] == [PointStatus.MISSING] * 2


def test_points_are_matched_by_text_whatever_order_the_model_used():
    aligned = align_point_checks(
        _checks(
            ("velocità effettiva", PointStatus.COVERED),
            ("Rotta vera!", PointStatus.PARTIAL),
        ),
        ("Rotta vera", "Velocità effettiva"),
    )

    assert [pc.status for pc in aligned] == [PointStatus.PARTIAL, PointStatus.COVERED]


def test_a_rephrased_point_still_counts_when_it_can_mean_nothing_else():
    aligned = align_point_checks(
        _checks(("La rotta vera sulla carta nautica", PointStatus.COVERED)),
        ("Rotta vera", "Velocità effettiva"),
    )

    assert [pc.status for pc in aligned] == [PointStatus.COVERED, PointStatus.MISSING]


def test_a_check_that_could_belong_to_two_points_credits_neither():
    """Fra due punti che iniziano uguale, «rotta» non dice quale sia stato valutato."""
    aligned = align_point_checks(
        _checks(("rotta", PointStatus.COVERED)),
        ("Rotta vera", "Rotta bussola"),
    )

    assert [pc.status for pc in aligned] == [PointStatus.MISSING] * 2


def test_extra_and_invented_checks_cannot_add_points():
    aligned = align_point_checks(
        _checks(
            ("Rotta vera", PointStatus.COVERED),
            ("Rotta vera", PointStatus.COVERED),
            ("Un punto che non esiste", PointStatus.COVERED),
        ),
        ("Rotta vera", "Velocità effettiva"),
    )

    assert len(aligned) == 2
    assert [pc.status for pc in aligned] == [PointStatus.COVERED, PointStatus.MISSING]


def test_a_question_whose_points_were_not_assessed_scores_zero():
    specs = [_spec("Q1", max_points=10)]
    res = _result(_feedback("Q1", PointStatus.COVERED, PointStatus.COVERED))
    # Il modello valuta due punti suoi invece dei due della rubrica.
    res.question_feedback[0].point_checks = _checks(
        ("Tutt'altro", PointStatus.COVERED), ("Altro ancora", PointStatus.COVERED)
    )

    apply_deterministic_grade(res, specs)

    assert res.question_feedback[0].score == 0
    assert res.score_30 == 0


def test_duplicated_expected_points_are_not_graded_twice():
    question = mock_mod.MockQuestionSchema(
        id="Q1",
        topic_id="t1",
        topic_title="T",
        question="?",
        expected_points=["Nullità", "  nullità  ", "", "Effetti"],
        max_points=10,
    )

    assert mock_mod._clean_expected_points(question) == ["Nullità", "Effetti"]
