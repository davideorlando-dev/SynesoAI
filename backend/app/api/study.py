import json
from datetime import date, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.logging_setup import get_logger
from app.agents.feynman import evaluate_feynman_explanation
from app.agents.mock_exam import generate_mock_exam, grade_mock_exam
from app.agents.synthesizer import (
    answer_topic_question,
    create_flashcard_from_selection,
    generate_more_flashcards,
    prepare_topic_context,
    stream_topic_notes_from_context,
    synthesize_topic_extras_from_context,
    synthesize_topic_materials,
)
from app.core.citations import resolve_doc_page, verify_highlights
from app.core.errors import (
    ExamNotFoundError,
    FlashcardNotFoundError,
    LLMInvalidResponseError,
    PlanItemNotFoundError,
    TopicNotFoundError,
)
from app.core.fsrs_engine import (
    create_new_fsrs_card_json,
    preview_fsrs_intervals,
    review_fsrs_card,
)
from app.core.llm import transcribe_audio_with_groq
from app.db.database import engine, get_session
from app.db.models import (
    CardType,
    Exam,
    FeynmanSession,
    Flashcard,
    MockExamSession,
    StudyPlanItem,
    Topic,
    TopicStatus,
    TutorMessage,
    utc_now,
    TopicPriority,
    StudyActivityLog,
)

log = get_logger("app.api.study")

router = APIRouter(prefix="/study", tags=["study"])


class FeynmanRequest(BaseModel):
    explanation: str = Field(min_length=5)
    session_id: str | None = None


class ReviewRequest(BaseModel):
    rating: int = Field(ge=1, le=4, description="1=Again, 2=Hard, 3=Good, 4=Easy")


class UpdateNotesRequest(BaseModel):
    notes_markdown: str = Field(min_length=1)


class MockExamGradeRequest(BaseModel):
    questions: list[dict]
    answers: dict[str, str]


@router.post("/transcribe")
async def transcribe_voice_explanation(
    audio: UploadFile = File(...),
    language: str = Form("auto"),
):
    raw_bytes = await audio.read()
    if len(raw_bytes) < 500:
        raise HTTPException(status_code=400, detail="Audio troppo breve o vuoto.")
    if len(raw_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio troppo lungo (massimo 25 MB).")
    text = transcribe_audio_with_groq(
        audio_bytes=raw_bytes,
        filename=audio.filename or "recording.webm",
        content_type=audio.content_type or "audio/webm",
        language=language,
    )
    return {"text": text}


@router.post("/topics/{topic_id}/synthesize")
def generate_topic_notes_and_cards(
    topic_id: str,
    force: bool = False,
    session: Session = Depends(get_session),
):
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")

    if topic.notes_markdown and not force:
        cards = session.exec(select(Flashcard).where(Flashcard.topic_id == topic_id)).all()
        return {
            "topic_id": topic.id,
            "title": topic.title,
            "notes_markdown": topic.notes_markdown,
            "highlights": json.loads(topic.highlights_json or "[]"),
            "flashcards_count": len(cards),
        }

    if force:
        old_cards = session.exec(
            select(Flashcard).where(
                Flashcard.topic_id == topic_id,
                Flashcard.origin == "SYNTHESIZER",
            )
        ).all()
        for oc in old_cards:
            session.delete(oc)

    result, doc_meta, chunk_refs = synthesize_topic_materials(session, topic)
    doc_by_index = {idx: (did, fname, pcount) for idx, did, fname, pcount in doc_meta}
    serialized_highlights = verify_highlights(result.highlights, doc_meta, chunk_refs)

    topic.notes_markdown = result.notes_markdown
    topic.highlights_json = json.dumps(serialized_highlights)
    session.add(topic)

    created_cards = []
    for fc in result.flashcards:
        doc_id, _, page_num = resolve_doc_page(fc.doc_index, fc.page_number, doc_by_index)
        card = Flashcard(
            exam_id=topic.exam_id,
            topic_id=topic.id,
            card_type=fc.card_type,
            front=fc.front,
            back=fc.back,
            source_ref_json=json.dumps({"doc_id": doc_id, "page": page_num}),
            origin="SYNTHESIZER",
            fsrs_card_json=create_new_fsrs_card_json(),
            due_at=utc_now(),
        )
        session.add(card)
        created_cards.append(card)
    session.add(StudyActivityLog(exam_id=topic.exam_id, activity_type="NOTES"))
    session.commit()

    return {
        "topic_id": topic.id,
        "title": topic.title,
        "notes_markdown": topic.notes_markdown,
        "highlights": serialized_highlights,
        "flashcards_created": [
            {"id": c.id, "type": c.card_type, "front": c.front, "back": c.back}
            for c in created_cards
        ],
    }


@router.get("/topics/{topic_id}/feynman-history")
def get_feynman_history(topic_id: str, session: Session = Depends(get_session)):
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")

    latest = session.exec(
        select(FeynmanSession)
        .where(FeynmanSession.topic_id == topic_id)
        .order_by(FeynmanSession.created_at.desc())
    ).first()

    draft = topic.feynman_draft or ""
    if not latest:
        return {"session": None, "draft": draft}

    transcript = json.loads(latest.transcript_json or "[]")
    last_examiner = next(
        (t for t in reversed(transcript) if t.get("role") == "examiner"), {}
    )
    return {
        "session": {
            "session_id": latest.id,
            "topic_id": topic.id,
            "topic_status": topic.status,
            "mastery_score": latest.final_score,
            "passed": latest.passed,
            "rubric": last_examiner.get("rubric", []),
            "understood_points": last_examiner.get("understood", []),
            "missing_or_wrong": json.loads(latest.gaps_json or "[]"),
            "socratic_followup": last_examiner.get("text", ""),
            "transcript": transcript,
        },
        "draft": draft,
    }


@router.post("/topics/{topic_id}/feynman")
def run_feynman_checkpoint(
    topic_id: str,
    body: FeynmanRequest,
    session: Session = Depends(get_session),
):
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")

    f_session: FeynmanSession | None = None
    transcript: list[dict] = []
    prior_rubric: list[dict] | None = None
    if body.session_id:
        candidate = session.get(FeynmanSession, body.session_id)
        if candidate and candidate.topic_id == topic_id:
            f_session = candidate
            transcript = json.loads(f_session.transcript_json or "[]")
            last_examiner = next(
                (t for t in reversed(transcript) if t.get("role") == "examiner"), None
            )
            if last_examiner:
                prior_rubric = last_examiner.get("rubric")

    eval_res = evaluate_feynman_explanation(
        session,
        topic,
        body.explanation,
        prior_transcript=transcript,
        prior_rubric=prior_rubric,
    )

    topic.mastery_score = max(topic.mastery_score, eval_res.mastery_score)
    if eval_res.passed or topic.status == TopicStatus.MASTERED:
        topic.status = TopicStatus.MASTERED
    else:
        topic.status = TopicStatus.FEYNMAN_PENDING
    topic.feynman_draft = None
    session.add(topic)

    if eval_res.passed:
        plan_items = session.exec(
            select(StudyPlanItem).where(StudyPlanItem.topic_id == topic.id)
        ).all()
        for pi in plan_items:
            pi.completed = True
            session.add(pi)

    serialized_rubric = [
        {
            "concept": r.concept,
            "weight": r.weight,
            "status": r.status.value,
            "evidence": r.evidence,
            "source_doc_id": r.source_doc_id,
            "source_page": r.source_page,
        }
        for r in eval_res.rubric
    ]

    transcript.append({"role": "student", "text": body.explanation})
    transcript.append(
        {
            "role": "examiner",
            "text": eval_res.socratic_followup,
            "score": eval_res.mastery_score,
            "understood": eval_res.understood_points,
            "gaps": eval_res.missing_or_wrong,
            "rubric": serialized_rubric,
        }
    )

    if f_session is None:
        f_session = FeynmanSession(
            topic_id=topic.id,
            transcript_json=json.dumps(transcript),
            gaps_json=json.dumps(eval_res.missing_or_wrong),
            final_score=eval_res.mastery_score,
            passed=eval_res.passed,
        )
    else:
        f_session.transcript_json = json.dumps(transcript)
        f_session.gaps_json = json.dumps(eval_res.missing_or_wrong)
        f_session.final_score = eval_res.mastery_score
        f_session.passed = eval_res.passed
    session.add(f_session)

    existing_fronts = {
        c.front.strip().lower()
        for c in session.exec(
            select(Flashcard).where(
                Flashcard.topic_id == topic.id, Flashcard.origin == "FEYNMAN_GAP"
            )
        ).all()
    }
    gap_cards = []
    for gc in eval_res.gap_flashcards:
        if gc.front.strip().lower() in existing_fronts:
            continue
        card = Flashcard(
            exam_id=topic.exam_id,
            topic_id=topic.id,
            card_type=CardType.BASIC,
            front=gc.front,
            back=gc.back,
            origin="FEYNMAN_GAP",
            fsrs_card_json=create_new_fsrs_card_json(),
            due_at=utc_now(),
        )
        session.add(card)
        gap_cards.append(card)
    session.add(StudyActivityLog(exam_id=topic.exam_id, activity_type="FEYNMAN"))
    session.commit()
    session.refresh(f_session)

    return {
        "session_id": f_session.id,
        "topic_id": topic.id,
        "topic_status": topic.status,
        "mastery_score": eval_res.mastery_score,
        "passed": eval_res.passed,
        "rubric": serialized_rubric,
        "understood_points": eval_res.understood_points,
        "missing_or_wrong": eval_res.missing_or_wrong,
        "socratic_followup": eval_res.socratic_followup,
        "transcript": transcript,
        "auto_generated_gap_cards": [
            {"id": c.id, "front": c.front, "back": c.back} for c in gap_cards
        ],
    }


@router.get("/exams/{exam_id}/due-cards")
def get_due_flashcards(
    exam_id: str,
    include_upcoming: bool = False,
    lang: str = "it",
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    exam_date = exam.exam_date if exam else None

    excluded_topic_ids = {
        t.id
        for t in session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
        if t.excluded
    }
    cards = [
        c
        for c in session.exec(select(Flashcard).where(Flashcard.exam_id == exam_id)).all()
        if c.topic_id not in excluded_topic_ids
    ]
    now = utc_now()
    if not include_upcoming:
        cards = [c for c in cards if c.due_at.replace(tzinfo=timezone.utc) <= now]

    return {
        "count": len(cards),
        "cards": [
            {
                "id": c.id,
                "topic_id": c.topic_id,
                "type": c.card_type,
                "origin": c.origin,
                "front": c.front,
                "back": c.back,
                "due_at": c.due_at,
                "previews": preview_fsrs_intervals(c.fsrs_card_json, exam_date=exam_date, lang=lang),
            }
            for c in cards
        ],
    }


@router.post("/cards/{card_id}/review")
def review_flashcard(
    card_id: str,
    body: ReviewRequest,
    session: Session = Depends(get_session),
):
    card = session.get(Flashcard, card_id)
    if not card:
        raise FlashcardNotFoundError("La flashcard non esiste più.")

    exam = session.get(Exam, card.exam_id)
    exam_date = exam.exam_date if exam else None

    updated_json, next_due = review_fsrs_card(
        card.fsrs_card_json, body.rating, exam_date=exam_date
    )
    card.fsrs_card_json = updated_json
    card.due_at = next_due
    session.add(card)
    session.add(StudyActivityLog(exam_id=card.exam_id, activity_type="FSRS_REVIEW"))
    session.commit()

    return {
        "card_id": card.id,
        "rating_given": body.rating,
        "next_due_at": next_due,
        "capped_to_exam_date": exam_date,
    }


@router.patch("/plan-items/{item_id}/toggle")
def toggle_plan_item(item_id: str, session: Session = Depends(get_session)):
    item = session.get(StudyPlanItem, item_id)
    if not item:
        raise PlanItemNotFoundError("L'attività del piano non esiste più.")
    item.completed = not item.completed
    session.add(item)
    session.commit()
    session.refresh(item)
    return {"id": item.id, "completed": item.completed}


@router.post("/topics/{topic_id}/more-cards")
def create_extra_flashcards(
    topic_id: str,
    count: int = 5,
    session: Session = Depends(get_session),
):
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")

    existing_cards = session.exec(
        select(Flashcard).where(Flashcard.topic_id == topic_id)
    ).all()
    existing_fronts = [c.front for c in existing_cards]
    existing_set = {f.strip().lower() for f in existing_fronts}

    result, doc_by_index = generate_more_flashcards(
        session, topic, existing_fronts, count=max(2, min(8, count))
    )

    created = []
    for fc in result.flashcards:
        if fc.front.strip().lower() in existing_set:
            continue
        existing_set.add(fc.front.strip().lower())
        doc = doc_by_index.get(fc.doc_index)
        valid_page = (
            fc.page_number
            if doc
            and fc.page_number
            and fc.page_number >= 1
            and (doc.page_count == 0 or fc.page_number <= doc.page_count)
            else None
        )
        card = Flashcard(
            exam_id=topic.exam_id,
            topic_id=topic.id,
            card_type=fc.card_type,
            front=fc.front,
            back=fc.back,
            source_ref_json=json.dumps(
                {"doc_id": doc.id if doc and valid_page else None, "page": valid_page}
            ),
            origin="SYNTHESIZER",
            fsrs_card_json=create_new_fsrs_card_json(),
            due_at=utc_now(),
        )
        session.add(card)
        created.append(card)

    session.commit()
    return {"topic_id": topic.id, "added_count": len(created)}


@router.patch("/topics/{topic_id}/notes")
def update_topic_notes(
    topic_id: str,
    body: UpdateNotesRequest,
    session: Session = Depends(get_session),
):
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")
    topic.notes_markdown = body.notes_markdown
    session.add(topic)
    session.commit()
    return {"topic_id": topic.id, "notes_markdown": topic.notes_markdown}

class UpdateTopicRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    priority: TopicPriority | None = None
    excluded: bool | None = None


@router.patch("/topics/{topic_id}")
def update_topic_settings(
    topic_id: str,
    body: UpdateTopicRequest,
    session: Session = Depends(get_session),
):
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")

    if body.title is not None:
        topic.title = body.title.strip()
    if body.description is not None:
        topic.description = body.description.strip()
    if body.priority is not None:
        topic.priority = body.priority

    if body.excluded is not None and body.excluded != topic.excluded:
        topic.excluded = body.excluded
        if body.excluded:
            uncompleted = session.exec(
                select(StudyPlanItem).where(
                    StudyPlanItem.topic_id == topic.id,
                    StudyPlanItem.completed == False,  # noqa: E712
                )
            ).all()
            for pi in uncompleted:
                session.delete(pi)
        else:
            existing_items = session.exec(
                select(StudyPlanItem).where(StudyPlanItem.topic_id == topic.id)
            ).all()
            if not existing_items and topic.status != TopicStatus.MASTERED:
                session.add(
                    StudyPlanItem(
                        exam_id=topic.exam_id,
                        topic_id=topic.id,
                        scheduled_date=date.today(),
                        task_type="LEARN_TOPIC",
                        title=f"[{topic.priority.value}] {topic.title}",
                    )
                )

    if not topic.excluded and (body.title is not None or body.priority is not None):
        for pi in session.exec(
            select(StudyPlanItem).where(
                StudyPlanItem.topic_id == topic.id,
                StudyPlanItem.completed == False,  # noqa: E712
            )
        ).all():
            pi.title = f"[{topic.priority.value}] {topic.title}"
            session.add(pi)

    session.add(topic)
    session.commit()
    session.refresh(topic)
    return {"topic": topic}

@router.post("/topics/{topic_id}/synthesize-stream")
def stream_topic_notes_and_cards(
    topic_id: str,
    force: bool = False,
    lang: str = "it",
):
    def event_stream():
        try:
            with Session(engine) as s:
                topic = s.get(Topic, topic_id)
                if not topic:
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Topic not found'})}\n\n"
                    return

                if topic.notes_markdown and not force:
                    yield f"data: {json.dumps({'type': 'token', 'text': topic.notes_markdown})}\n\n"
                    yield f"data: {json.dumps({'type': 'done', 'highlights': json.loads(topic.highlights_json or '[]')})}\n\n"
                    return

                topic_title = topic.title
                topic_description = topic.description
                exam_id = topic.exam_id
                context_text, web_block, doc_meta, chunk_refs = prepare_topic_context(s, topic)

            parts: list[str] = []
            for token in stream_topic_notes_from_context(
                topic_title, topic_description, context_text, web_block
            ):
                parts.append(token)
                yield f"data: {json.dumps({'type': 'token', 'text': token})}\n\n"

            full_notes = "".join(parts).strip()
            if not full_notes:
                raise LLMInvalidResponseError("Il modello ha restituito appunti vuoti. Riprova.")

            phase_msg = (
                "Extracting PDF citations and review flashcards..."
                if lang == "en"
                else "Estraggo citazioni dal PDF e flashcard di ripasso..."
            )
            yield f"data: {json.dumps({'type': 'phase', 'message': phase_msg})}\n\n"

            extras = synthesize_topic_extras_from_context(
                topic_title, topic_description, context_text
            )

            doc_by_index = {idx: (did, fname, pcount) for idx, did, fname, pcount in doc_meta}
            serialized_highlights = verify_highlights(extras.highlights, doc_meta, chunk_refs)

            with Session(engine) as s:
                topic = s.get(Topic, topic_id)
                if not topic:
                    raise RuntimeError("Topic eliminato durante la generazione.")

                if force:
                    old_cards = s.exec(
                        select(Flashcard).where(
                            Flashcard.topic_id == topic_id,
                            Flashcard.origin == "SYNTHESIZER",
                        )
                    ).all()
                    for oc in old_cards:
                        s.delete(oc)
                    s.flush()

                topic.notes_markdown = full_notes
                topic.highlights_json = json.dumps(serialized_highlights)
                s.add(topic)

                for fc in extras.flashcards:
                    doc_id, _, page_num = resolve_doc_page(
                        fc.doc_index, fc.page_number, doc_by_index
                    )
                    card = Flashcard(
                        exam_id=exam_id,
                        topic_id=topic_id,
                        card_type=fc.card_type,
                        front=fc.front,
                        back=fc.back,
                        source_ref_json=json.dumps({"doc_id": doc_id, "page": page_num}),
                        origin="SYNTHESIZER",
                        fsrs_card_json=create_new_fsrs_card_json(),
                        due_at=utc_now(),
                    )
                    s.add(card)
                s.add(StudyActivityLog(exam_id=exam_id, activity_type="NOTES"))
                s.commit()

            yield f"data: {json.dumps({'type': 'done', 'highlights': serialized_highlights})}\n\n"
        except Exception as exc:
            log.error(f"❌ Errore synthesize-stream su topic {topic_id}: {exc}")
            error_code = getattr(exc, "code", "internal_error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc), 'code': error_code})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/exams/{exam_id}/mock-exam/generate")
def create_mock_exam(
    exam_id: str,
    count: int = 6,
    focus: str = "ALL",
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")
    res = generate_mock_exam(
        session, exam, question_count=max(3, min(10, count)), focus=focus
    )
    return res.model_dump()



@router.post("/exams/{exam_id}/mock-exam/grade")
def submit_mock_exam(
    exam_id: str,
    body: MockExamGradeRequest,
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    res = grade_mock_exam(session, exam, body.questions, body.answers)

    topics = session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    valid_topic_ids = {t.id for t in topics}
    fallback_topic_id = topics[0].id if topics else None

    added_cards = []
    for gc in res.gap_flashcards:
        tid = gc.topic_id if gc.topic_id in valid_topic_ids else fallback_topic_id
        if not tid:
            continue
        card = Flashcard(
            exam_id=exam_id,
            topic_id=tid,
            card_type=CardType.EXAM_Q,
            front=gc.front,
            back=gc.back,
            origin="MOCK_EXAM",
            fsrs_card_json=create_new_fsrs_card_json(),
            due_at=utc_now(),
        )
        session.add(card)
        added_cards.append(card)

    if res.passed:
        mock_items = session.exec(
            select(StudyPlanItem).where(
                StudyPlanItem.exam_id == exam_id,
                StudyPlanItem.task_type == "MOCK_REVIEW",
            )
        ).all()
        for mi in mock_items:
            mi.completed = True
            session.add(mi)

    mock_session = MockExamSession(
        exam_id=exam_id,
        score_30=res.score_30,
        passed=res.passed,
        overall_feedback=res.overall_feedback,
        questions_json=json.dumps(body.questions),
        answers_json=json.dumps(body.answers),
        feedback_json=json.dumps([f.model_dump() for f in res.question_feedback]),
    )
    session.add(mock_session)
    session.add(StudyActivityLog(exam_id=exam_id, activity_type="MOCK"))
    session.commit()
    session.refresh(mock_session)
    out = res.model_dump()
    out["session_id"] = mock_session.id
    out["added_cards_count"] = len(added_cards)
    return out


@router.get("/exams/{exam_id}/mock-history")
def get_mock_exam_history(exam_id: str, session: Session = Depends(get_session)):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")
    rows = session.exec(
        select(MockExamSession)
        .where(MockExamSession.exam_id == exam_id)
        .order_by(MockExamSession.created_at.desc())
    ).all()
    return {
        "sessions": [
            {
                "id": r.id,
                "score_30": r.score_30,
                "passed": r.passed,
                "overall_feedback": r.overall_feedback,
                "questions": json.loads(r.questions_json or "[]"),
                "answers": json.loads(r.answers_json or "{}"),
                "feedback": json.loads(r.feedback_json or "[]"),
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


class AskTutorRequest(BaseModel):
    question: str = Field(min_length=2)
    selected_text: str | None = None


class CardFromTextRequest(BaseModel):
    selected_text: str = Field(min_length=5)


@router.post("/topics/{topic_id}/ask")
def ask_topic_tutor(
    topic_id: str,
    body: AskTutorRequest,
    session: Session = Depends(get_session),
):
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")

    result, doc_by_index = answer_topic_question(
        session, topic, body.question, selected_text=body.selected_text
    )

    citations = []
    seen_pairs: set[tuple[str, int]] = set()
    for c in result.citations:
        doc = doc_by_index.get(c.doc_index)
        if not doc:
            continue
        pair = (doc.id, c.page_number)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        citations.append(
            {
                "doc_id": doc.id,
                "filename": doc.filename,
                "page_number": c.page_number,
            }
        )

    message = TutorMessage(
        topic_id=topic.id,
        question=body.question,
        selected_text=body.selected_text,
        answer_markdown=result.answer_markdown,
        citations_json=json.dumps(citations),
    )
    session.add(message)
    session.commit()

    return {
        "id": message.id,
        "answer_markdown": result.answer_markdown,
        "citations": citations,
    }


@router.post("/topics/{topic_id}/card-from-text")
def create_card_from_selected_text(
    topic_id: str,
    body: CardFromTextRequest,
    session: Session = Depends(get_session),
):
    topic = session.get(Topic, topic_id)
    if not topic:
        raise TopicNotFoundError("L'argomento non esiste più.")

    res = create_flashcard_from_selection(session, topic, body.selected_text)
    card = Flashcard(
        exam_id=topic.exam_id,
        topic_id=topic.id,
        card_type=res.card_type,
        front=res.front,
        back=res.back,
        origin="SYNTHESIZER",
        fsrs_card_json=create_new_fsrs_card_json(),
        due_at=utc_now(),
    )
    session.add(card)
    session.commit()
    session.refresh(card)
    return {
        "card": {
            "id": card.id,
            "type": card.card_type,
            "front": card.front,
            "back": card.back,
        }
    }
