"""
Backend per i test end-to-end.

Avvia la vera applicazione — database, parsing dei PDF, migrazioni, piano di
studio — su una cartella dati temporanea, sostituendo soltanto le chiamate al
modello con risposte fisse. I test verificano così i percorsi dell'utente
senza dipendere da Groq, da una chiave API o dalla rete.

Avvio:  python -m tests.e2e.stub_server --port 8101 --data-dir /tmp/e2e
Le sostituzioni vivono qui e non nel codice dell'app: nulla di tutto questo
finisce nell'applicazione distribuita.
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

FIXTURE_PAGES = [
    "Capitolo 1 — Principi di navigazione. La rotta vera è la direzione "
    "geografica che unisce due punti sulla carta nautica.",
    "Capitolo 2 — Calcolo della velocità. La velocità effettiva si ottiene "
    "dividendo la distanza percorsa per il tempo impiegato.",
]
STUB_TOPICS = [
    ("Principi di navigazione", "Rotta vera, meridiani e paralleli."),
    ("Calcolo della velocità", "Distanza, tempo e velocità effettiva."),
]


def write_fixture_pdf(path: Path) -> None:
    """Crea il PDF usato dai test, con la stessa libreria che l'app userà per leggerlo."""
    import pymupdf

    path.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    for text in FIXTURE_PAGES:
        page = doc.new_page()
        page.insert_textbox(pymupdf.Rect(60, 60, 520, 760), text, fontsize=12)
    doc.save(path)
    doc.close()


def install_stubs() -> None:
    """Sostituisce le funzioni che parlano con il modello, lasciando intatto il resto."""
    import app.api.study as study_api
    import app.services.exam_import as exam_import
    from app.agents.feynman import FeynmanEvaluationResult
    from app.agents.mock_exam import (
        MockExamGenerationResult,
        MockExamGradingResult,
        MockQuestionSchema,
        PointCheckSchema,
        PointStatus,
        QuestionFeedbackSchema,
        apply_deterministic_grade,
    )
    from app.agents.synthesizer import (
        FlashcardSeedSchema,
        NotesExtrasResult,
        TutorAnswerResult,
    )
    from app.db.models import Topic, TopicPriority

    def fake_map_exam_topics(exam, chunks, docs, lang="it"):
        topics = [
            Topic(
                exam_id=exam.id,
                title=title,
                description=description,
                priority=TopicPriority.CORE,
                estimated_minutes=45,
            )
            for title, description in STUB_TOPICS
        ]
        # Il secondo argomento richiede il primo: senza un prerequisito vero
        # la mappa non avrebbe mai un legame da disegnare, e il test non
        # potrebbe distinguere "nessun legame" da "legami non disegnati".
        if len(topics) > 1:
            topics[1].prerequisites_json = json.dumps([topics[0].id])
        return "Contesto di prova per i test end-to-end.", topics, {}

    def fake_map_incremental_topics(exam, chunks, docs, existing):
        return [], {}

    def fake_stream_notes(topic_title, topic_description, context_text, web_block):
        yield f"## {topic_title}\n\n"
        yield "Appunti generati dal backend di prova per i test end-to-end.\n\n"
        # Nella notazione sbagliata di proposito: è quella che i modelli veri
        # usano, ed è il caso che il frontend deve saper raddrizzare.
        yield "\\[ \\text{Precision} = \\frac{TP}{TP + FP} \\]\n"

    def fake_extras(topic_title, topic_description, context_text):
        # Due carte vere: senza, il ripasso FSRS non avrebbe mai niente da
        # mostrare e la prova non saprebbe distinguere "nessuna carta in
        # scadenza" da "le carte non arrivano".
        return NotesExtrasResult(
            highlights=[],
            flashcards=[
                FlashcardSeedSchema(
                    front=f"Che cos'è {topic_title}?",
                    back="Definizione di prova per i test end-to-end.",
                ),
                FlashcardSeedSchema(
                    front=f"A cosa serve {topic_title}?",
                    back="Risposta di prova per i test end-to-end.",
                ),
            ],
        )

    def fake_tutor(*args, **kwargs):
        return TutorAnswerResult(answer_markdown="Risposta del tutor di prova."), {}

    def fake_feynman(*args, **kwargs):
        return FeynmanEvaluationResult(
            mastery_score=80,
            passed=True,
            understood_points=["Hai spiegato la rotta vera."],
            missing_or_wrong=[],
            socratic_followup="Come cambierebbe con una corrente laterale?",
        )

    def fake_generate_mock(session, exam, question_count=6, focus="ALL"):
        questions = [
            MockQuestionSchema(
                id=f"Q{i}",
                topic_id="",
                topic_title=title,
                question=f"Domanda di prova {i}: spiega {title.lower()}.",
                expected_points=[f"Punto {i}A", f"Punto {i}B"],
                max_points=10,
            )
            for i, (title, _) in enumerate(STUB_TOPICS, start=1)
        ]
        return MockExamGenerationResult(questions=questions)

    def fake_grade_mock(session, exam, questions, answers):
        feedback = [
            QuestionFeedbackSchema(
                question_id=q.get("id", ""),
                point_checks=[
                    PointCheckSchema(point=point, status=PointStatus.COVERED)
                    for point in q.get("expected_points", [])
                ],
                score=0,
                max_score=int(q.get("max_points", 5)),
                model_answer="Risposta modello di prova.",
            )
            for q in questions
        ]
        result = MockExamGradingResult(
            score_30=0,
            passed=False,
            overall_feedback="Correzione di prova per i test end-to-end.",
            question_feedback=feedback,
        )
        from app.agents.mock_exam import GradedQuestionSpec

        specs = [
            GradedQuestionSpec(
                question_id=q.get("id", ""),
                max_points=int(q.get("max_points", 5)),
                expected_points=tuple(q.get("expected_points", [])),
                answered=bool((answers.get(q.get("id", "")) or "").strip()),
            )
            for q in questions
        ]
        apply_deterministic_grade(result, specs)
        return result

    exam_import.map_exam_topics = fake_map_exam_topics
    exam_import.map_incremental_topics = fake_map_incremental_topics
    study_api.stream_topic_notes_from_context = fake_stream_notes
    study_api.synthesize_topic_extras_from_context = fake_extras
    study_api.answer_topic_question = fake_tutor
    study_api.evaluate_feynman_explanation = fake_feynman
    study_api.generate_mock_exam = fake_generate_mock
    study_api.grade_mock_exam = fake_grade_mock


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8101)
    parser.add_argument("--data-dir", default="")
    parser.add_argument("--fixture-pdf", default="")
    args = parser.parse_args()

    data_dir = Path(args.data_dir or Path(__file__).resolve().parent / ".tmp-data")
    if data_dir.exists():
        shutil.rmtree(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    # Le impostazioni vengono lette all'import: vanno fissate prima.
    os.environ["DATA_DIR"] = str(data_dir)
    os.environ["LOG_PATH"] = str(data_dir / "syneso.log")
    os.environ["ENABLE_WEB_SEARCH"] = "false"
    os.environ["GROQ_API_KEY"] = "gsk_e2e_stub_key_0000000000"

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    import uvicorn

    from app.main import app

    install_stubs()
    write_fixture_pdf(Path(args.fixture_pdf or data_dir / "dispensa.pdf"))

    # log_level="info" tiene accesi i log di accesso: in CI sono l'unica
    # traccia di quali richieste il browser ha davvero inviato.
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
