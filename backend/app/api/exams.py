from pathlib import Path
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, col, delete, select
import csv
import io
import json
import re

from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query
from app.api.annotations import delete_topic_annotations
from app.api.uploads import BinaryUploadFile, sanitize_disk_stem, store_uploads
from app.config import settings
from app.core.errors import (
    DocumentNotFoundError,
    ExamNotFoundError,
    PdfFileMissingError,
    SynesoError,
)
from app.core.planner import build_study_plan, topological_prioritized_order
from app.core.projection import TopicLoad, project_coverage
from app.core.retrieval import delete_exam_fts, search_exam_chunks
from app.core.fsrs_engine import compute_exam_retention_pct
from app.db.database import get_session
from app.db.models import (
    Document,
    DocumentChunk,
    Exam,
    FeynmanSession,
    Flashcard,
    ImportJob,
    MockExamSession,
    StudyActivityLog,
    StudyPlanItem,
    Topic,
    TopicPriority,
    TopicStatus,
    new_id,
    utc_now,
)
from app.services.exam_import import (
    NewExamParams,
    add_uploads_to_exam,
    create_exam_from_uploads,
)
from app.services.import_jobs import discard_uploads

def _compute_estimated_grade_30(
    mocks: list[MockExamSession], active_topics: list[Topic]
) -> int | None:
    avg_mastery = (
        sum(t.mastery_score for t in active_topics) / len(active_topics)
        if active_topics
        else 0.0
    )
    if mocks:
        recent_scores = [m.score_30 for m in mocks[:3]]
        mock_avg = sum(recent_scores) / len(recent_scores)
        if avg_mastery > 0:
            blended = 0.7 * mock_avg + 0.3 * (18.0 + (avg_mastery / 100.0) * 12.0)
            return max(0, min(30, round(blended)))
        return max(0, min(30, round(mock_avg)))
    if any(t.mastery_score > 0 for t in active_topics):
        return max(15, min(30, round(15.0 + (avg_mastery / 100.0) * 15.0)))
    return None


class CreateTopicRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = ""
    priority: TopicPriority = TopicPriority.CORE
    estimated_minutes: int = Field(default=45, ge=15, le=240)


router = APIRouter(prefix="/exams", tags=["exams"])


@router.get("/")
def list_exams(session: Session = Depends(get_session)):
    exams = session.exec(select(Exam).order_by(Exam.created_at.desc())).all()
    return {"exams": exams}


@router.get("/overview")
def get_exams_overview(session: Session = Depends(get_session)):
    exams = session.exec(select(Exam).order_by(Exam.created_at.desc())).all()
    now = utc_now()
    out = []
    for exam in exams:
        topics = session.exec(select(Topic).where(Topic.exam_id == exam.id)).all()
        excluded_ids = {t.id for t in topics if t.excluded}
        active_topics = [t for t in topics if not t.excluded]

        plan = session.exec(
            select(StudyPlanItem).where(StudyPlanItem.exam_id == exam.id)
        ).all()
        cards = [
            c
            for c in session.exec(
                select(Flashcard).where(Flashcard.exam_id == exam.id)
            ).all()
            if c.topic_id not in excluded_ids
        ]
        due_count = sum(
            1 for c in cards if c.due_at.replace(tzinfo=timezone.utc) <= now
        )
        mocks = session.exec(
            select(MockExamSession)
            .where(MockExamSession.exam_id == exam.id)
            .order_by(MockExamSession.created_at.desc())
        ).all()

        estimated_minutes_left = sum(
            t.estimated_minutes
            for t in active_topics
            if t.status != TopicStatus.MASTERED
        )
        latest_mock_score = mocks[0].score_30 if mocks else None
        est_grade = _compute_estimated_grade_30(mocks, active_topics)
        fsrs_retention, _ = compute_exam_retention_pct(
            [c.fsrs_card_json for c in cards], exam_date=exam.exam_date
        )

        out.append(
            {
                "exam": exam,
                "stats": {
                    "topicsTotal": len(active_topics),
                    "topicsMastered": sum(
                        1 for t in active_topics if t.status == TopicStatus.MASTERED
                    ),
                    "planTotal": len(plan),
                    "planDone": sum(1 for p in plan if p.completed),
                    "dueCards": due_count,
                    "totalCards": len(cards),
                    "estimatedMinutesLeft": estimated_minutes_left,
                    "mockCount": len(mocks),
                    "latestMockScore": latest_mock_score,
                    "estimatedGrade30": est_grade,
                    "fsrsRetention": fsrs_retention,
                },
            }
        )
    return {"items": out}


@router.get("/upcoming-deadlines")
def get_upcoming_deadlines(limit: int = 8, session: Session = Depends(get_session)):
    exams = {e.id: e for e in session.exec(select(Exam)).all()}
    plan_items = session.exec(
        select(StudyPlanItem).order_by(StudyPlanItem.scheduled_date.asc())
    ).all()

    today = date.today()
    items: list[dict] = []
    for pi in plan_items:
        ex = exams.get(pi.exam_id)
        if not ex:
            continue
        if pi.completed and pi.scheduled_date < today:
            continue
        items.append(
            {
                "id": pi.id,
                "kind": "plan",
                "exam_id": ex.id,
                "exam_title": ex.title,
                "topic_id": pi.topic_id,
                "task_type": pi.task_type,
                "title": re.sub(r"^\[.*?\]\s*", "", pi.title),
                "date": pi.scheduled_date,
                "completed": pi.completed,
            }
        )
        if len(items) >= limit:
            break

    for ex in sorted(
        [e for e in exams.values() if e.exam_date and e.exam_date >= today],
        key=lambda x: x.exam_date,  # type: ignore[arg-type]
    ):
        items.append(
            {
                "id": f"exam-date-{ex.id}",
                "kind": "exam_date",
                "exam_id": ex.id,
                "exam_title": ex.title,
                "topic_id": None,
                "task_type": "EXAM_DAY",
                "title": "Esame",
                "date": ex.exam_date,
                "completed": False,
            }
        )

    items.sort(key=lambda x: (x["date"], 1 if x["kind"] == "exam_date" else 0))
    return {"items": items[:limit]}


@router.get("/archive")
def get_global_archive(session: Session = Depends(get_session)):
    exams = {e.id: e.title for e in session.exec(select(Exam)).all()}
    rows: list[dict] = []

    for doc in session.exec(select(Document)).all():
        rows.append(
            {
                "id": doc.id,
                "kind": "pdf",
                "title": doc.filename,
                "exam_id": doc.exam_id,
                "exam_title": exams.get(doc.exam_id, ""),
                "doc_id": doc.id,
                "topic_id": None,
                "updated_at": doc.created_at,
                "meta": f"{doc.page_count} pag.",
            }
        )

    for topic in session.exec(select(Topic)).all():
        if topic.excluded or not topic.notes_markdown:
            continue
        rows.append(
            {
                "id": f"note-{topic.id}",
                "kind": "note",
                "title": topic.title,
                "exam_id": topic.exam_id,
                "exam_title": exams.get(topic.exam_id, ""),
                "doc_id": None,
                "topic_id": topic.id,
                "updated_at": None,
                "meta": topic.priority.value,
            }
        )

    for ms in session.exec(select(MockExamSession)).all():
        rows.append(
            {
                "id": f"mock-{ms.id}",
                "kind": "mock",
                "title": f"Simulazione — {ms.score_30}/30",
                "exam_id": ms.exam_id,
                "exam_title": exams.get(ms.exam_id, ""),
                "doc_id": None,
                "topic_id": None,
                "updated_at": ms.created_at,
                "meta": "Superato" if ms.passed else "Da rafforzare",
            }
        )

    rows.sort(
        key=lambda r: r["updated_at"].isoformat() if r["updated_at"] else "",
        reverse=True,
    )
    return {"items": rows}


@router.get("/{exam_id}/analytics")
def get_exam_analytics(exam_id: str, session: Session = Depends(get_session)):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    all_topics = session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    topics = [t for t in all_topics if not t.excluded]
    excluded_ids = {t.id for t in all_topics if t.excluded}

    cards = [
        c
        for c in session.exec(select(Flashcard).where(Flashcard.exam_id == exam_id)).all()
        if c.topic_id not in excluded_ids
    ]
    mocks = session.exec(
        select(MockExamSession)
        .where(MockExamSession.exam_id == exam_id)
        .order_by(MockExamSession.created_at.desc())
    ).all()

    logs = session.exec(
        select(StudyActivityLog).where(StudyActivityLog.exam_id == exam_id)
    ).all()

    local_today = datetime.now().astimezone().date()
    counts_by_day: dict[date, int] = {}
    for lg in logs:
        d = lg.created_at.replace(tzinfo=timezone.utc).astimezone().date()
        counts_by_day[d] = counts_by_day.get(d, 0) + 1

    day_names_it = ["L", "M", "M", "G", "V", "S", "D"]
    weekly_activity = []
    for offset in range(6, -1, -1):
        day = local_today - timedelta(days=offset)
        weekly_activity.append(
            {
                "date": day.isoformat(),
                "weekday_idx": day.weekday(),
                "label": day_names_it[day.weekday()],
                "count": counts_by_day.get(day, 0),
            }
        )

    est_grade = _compute_estimated_grade_30(mocks, topics)
    fsrs_retention, _ = compute_exam_retention_pct(
        [c.fsrs_card_json for c in cards], exam_date=exam.exam_date
    )

    return {
        "fsrs_retention": fsrs_retention,
        "estimated_minutes_left": sum(
            t.estimated_minutes for t in topics if t.status != TopicStatus.MASTERED
        ),
        "estimated_grade_30": est_grade,
        "topics_total": len(topics),
        "topics_mastered": sum(1 for t in topics if t.status == TopicStatus.MASTERED),
        "weekly_activity": weekly_activity,
        "topic_mastery": [
            {
                "id": t.id,
                "title": t.title,
                "priority": t.priority.value,
                "status": t.status.value,
                "mastery_score": t.mastery_score,
            }
            for t in topics
        ],
    }


@router.post("/")
def create_exam_and_plan(
    title: str = Form(...),
    university: str | None = Form(None),
    degree_course: str | None = Form(None),
    professor: str | None = Form(None),
    exam_date: date | None = Form(None),
    daily_hours: float = Form(2.0),
    lang: str = Form("it"),
    files: list[BinaryUploadFile] = File(...),
    session: Session = Depends(get_session),
    syllabus_guidance: str | None = Form(None),
):
    exam_id = new_id()
    uploads = store_uploads(files, exam_id)
    params = NewExamParams(
        title=title,
        university=university,
        degree_course=degree_course,
        professor=professor,
        exam_date=exam_date,
        daily_hours=daily_hours,
        syllabus_guidance=syllabus_guidance,
    )
    try:
        created = create_exam_from_uploads(session, exam_id, params, uploads, lang=lang)
        session.commit()
    except Exception as exc:
        session.rollback()
        discard_uploads(uploads)
        if isinstance(exc, (HTTPException, SynesoError)):
            raise
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "exam_id": exam_id,
        "web_context_summary": created.exam.web_context_summary,
        "topics_count": len(created.topics),
        "plan_items": [
            {"date": p.scheduled_date, "type": p.task_type, "title": p.title}
            for p in created.plan_items
        ],
    }


@router.post("/{exam_id}/documents")
def add_documents_to_exam(
    exam_id: str,
    lang: str = Form("it"),
    files: list[BinaryUploadFile] = File(...),
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    uploads = store_uploads(files, exam.id)
    try:
        added = add_uploads_to_exam(session, exam, uploads, lang=lang)
        session.commit()
    except Exception as exc:
        session.rollback()
        discard_uploads(uploads)
        if isinstance(exc, (HTTPException, SynesoError)):
            raise
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "exam_id": exam_id,
        "added_documents": [doc.filename for doc in added.documents],
        "new_topics_count": len(added.topics),
        "new_plan_items_count": len(added.plan_items),
    }


@router.get("/{exam_id}/roadmap")
def get_exam_roadmap(exam_id: str, session: Session = Depends(get_session)):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")
    docs = session.exec(
        select(Document).where(Document.exam_id == exam_id).order_by(Document.created_at)
    ).all()
    topics = session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    plan = session.exec(
        select(StudyPlanItem)
        .where(StudyPlanItem.exam_id == exam_id)
        .order_by(StudyPlanItem.scheduled_date)
    ).all()
    return {
        "exam": exam,
        "documents": [
            {"id": d.id, "filename": d.filename, "page_count": d.page_count}
            for d in docs
        ],
        "topics": topics,
        "plan": plan,
    }


@router.get("/{exam_id}/search")
def search_exam_materials(
    exam_id: str,
    q: str = Query(default="", max_length=120),
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    query = q.strip()
    if len(query) < 2:
        return {"results": []}

    ql = query.lower()
    results: list[dict] = []

    topics = [
        t
        for t in session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
        if not t.excluded
    ]
    topic_title_by_id = {t.id: t.title for t in topics}

    for t in topics:
        if ql in t.title.lower() or ql in t.description.lower():
            results.append(
                {
                    "type": "topic",
                    "title": t.title,
                    "snippet": t.description[:140],
                    "topic_id": t.id,
                    "tab": "STUDY",
                }
            )
        elif t.notes_markdown and ql in t.notes_markdown.lower():
            idx = t.notes_markdown.lower().find(ql)
            start = max(0, idx - 45)
            snippet = t.notes_markdown[start : idx + 115].replace("\n", " ").strip()
            results.append(
                {
                    "type": "note",
                    "title": t.title,
                    "snippet": f"...{snippet}...",
                    "topic_id": t.id,
                    "tab": "STUDY",
                }
            )

    cards = session.exec(select(Flashcard).where(Flashcard.exam_id == exam_id)).all()
    for c in cards:
        if c.topic_id not in topic_title_by_id:
            continue
        if ql in c.front.lower() or ql in c.back.lower():
            results.append(
                {
                    "type": "flashcard",
                    "title": c.front[:90],
                    "snippet": f"{topic_title_by_id.get(c.topic_id, '')} • {c.back[:90]}",
                    "topic_id": c.topic_id,
                    "tab": "FLASHCARDS",
                }
            )
            if len(results) >= 9:
                break

    docs_by_id = {
        d.id: d.filename
        for d in session.exec(select(Document).where(Document.exam_id == exam_id)).all()
    }
    pdf_hits = search_exam_chunks(session, exam_id, query, limit=4)
    for ch in pdf_hits:
        results.append(
            {
                "type": "pdf",
                "title": f"{docs_by_id.get(ch.document_id, 'PDF')} • Pag. {ch.page_number}",
                "snippet": ch.text[:140].replace("\n", " "),
                "doc_id": ch.document_id,
                "page_number": ch.page_number,
                "tab": "STUDY",
            }
        )

    return {"results": results[:12]}


@router.get("/{exam_id}/insights")
def get_exam_insights(exam_id: str, session: Session = Depends(get_session)):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    all_topics = session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    excluded_ids = {t.id for t in all_topics if t.excluded}
    active_topics = [t for t in all_topics if not t.excluded]

    active_ids = {t.id for t in active_topics}
    prereqs_map: dict[str, list[str]] = {}
    for t in active_topics:
        try:
            raw_ids = json.loads(t.prerequisites_json or "[]")
            prereqs_map[t.id] = [pid for pid in raw_ids if pid in active_ids]
        except Exception:
            prereqs_map[t.id] = []

    ordered_topics = topological_prioritized_order(active_topics, prereqs_map)

    plan_items = session.exec(
        select(StudyPlanItem)
        .where(StudyPlanItem.exam_id == exam_id)
        .order_by(StudyPlanItem.scheduled_date)
    ).all()
    plan_total = len(plan_items)
    plan_done = sum(1 for p in plan_items if p.completed)

    cards = [
        c
        for c in session.exec(select(Flashcard).where(Flashcard.exam_id == exam_id)).all()
        if c.topic_id not in excluded_ids
    ]
    now = utc_now()
    due_cards = sum(1 for c in cards if c.due_at.replace(tzinfo=timezone.utc) <= now)

    fsrs_retention_pct, reviewed_cards = compute_exam_retention_pct(
        [c.fsrs_card_json for c in cards], exam_date=exam.exam_date
    )

    mocks = session.exec(
        select(MockExamSession)
        .where(MockExamSession.exam_id == exam_id)
        .order_by(MockExamSession.created_at.desc())
    ).all()

    topics_total = len(ordered_topics)
    topics_mastered = sum(1 for t in ordered_topics if t.status == TopicStatus.MASTERED)
    avg_mastery = (
        sum(t.mastery_score for t in ordered_topics) / topics_total
        if topics_total > 0
        else 0.0
    )

    plan_pct = (plan_done / plan_total * 100.0) if plan_total > 0 else 0.0
    preparation_pct = (
        round(0.45 * plan_pct + 0.55 * avg_mastery)
        if topics_total > 0
        else round(plan_pct)
    )

    remaining_mins = sum(
        t.estimated_minutes for t in ordered_topics if t.status != TopicStatus.MASTERED
    )
    estimated_hours_left = round(remaining_mins / 60.0, 1)
    estimated_grade_30 = _compute_estimated_grade_30(mocks, ordered_topics)

    topic_by_id = {t.id: t for t in ordered_topics}
    next_tasks = []
    for p in plan_items:
        if p.completed:
            continue
        linked = topic_by_id.get(p.topic_id) if p.topic_id else None
        next_tasks.append(
            {
                "id": p.id,
                "kind": "MOCK" if p.task_type == "MOCK_REVIEW" else "STUDY",
                "topic_id": p.topic_id,
                "title": linked.title if linked else p.title,
                "priority": linked.priority.value if linked else None,
                "estimated_minutes": linked.estimated_minutes if linked else 45,
                "scheduled_date": p.scheduled_date.isoformat(),
            }
        )
        if len(next_tasks) >= 3:
            break

    feynman_pending = next(
        (t for t in ordered_topics if t.status == TopicStatus.FEYNMAN_PENDING), None
    )

    return {
        "exam": exam,
        "preparation_pct": preparation_pct,
        "topics_total": topics_total,
        "topics_mastered": topics_mastered,
        "plan_total": plan_total,
        "plan_done": plan_done,
        "total_cards": len(cards),
        "due_cards": due_cards,
        "reviewed_cards": reviewed_cards,
        "fsrs_retention_pct": fsrs_retention_pct,
        "estimated_hours_left": estimated_hours_left,
        "mock_count": len(mocks),
        "latest_mock_score": mocks[0].score_30 if mocks else None,
        "estimated_grade_30": estimated_grade_30,
        "feynman_pending_topic": (
            {"id": feynman_pending.id, "title": feynman_pending.title}
            if feynman_pending
            else None
        ),
        "next_tasks": next_tasks,
        "topics_roadmap": [
            {
                "id": t.id,
                "title": t.title,
                "priority": t.priority.value,
                "status": t.status.value,
                "mastery_score": t.mastery_score,
                "estimated_minutes": t.estimated_minutes,
            }
            for t in ordered_topics
        ],
    }


TIMELINE_PAST_DAYS = 30
TIMELINE_FUTURE_DAYS = 5


@router.get("/{exam_id}/timeline")
def get_exam_timeline(exam_id: str, session: Session = Depends(get_session)):
    """La linea del tempo dell'esame: cosa hai fatto, cosa c'è davanti, dove arrivi.

    È la fonte della home. Il passato sono attività registrate davvero, il
    futuro sono le voci del piano non ancora chiuse, e la proiezione è il
    calcolo puro di `app.core.projection`: qui si raccolgono solo i dati.
    """
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    all_topics = session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    active_topics = [t for t in all_topics if not t.excluded]
    active_ids = {t.id for t in active_topics}

    prereqs_map: dict[str, list[str]] = {}
    for t in active_topics:
        try:
            raw_ids = json.loads(t.prerequisites_json or "[]")
            prereqs_map[t.id] = [pid for pid in raw_ids if pid in active_ids]
        except Exception:
            prereqs_map[t.id] = []
    ordered_topics = topological_prioritized_order(active_topics, prereqs_map)

    local_today = datetime.now().astimezone().date()
    days_left = (exam.exam_date - local_today).days if exam.exam_date else None

    logs = session.exec(
        select(StudyActivityLog).where(StudyActivityLog.exam_id == exam_id)
    ).all()
    counts_by_day: dict[date, int] = {}
    for lg in logs:
        day = lg.created_at.replace(tzinfo=timezone.utc).astimezone().date()
        counts_by_day[day] = counts_by_day.get(day, 0) + 1

    past: list[dict[str, object]] = []
    for offset in range(TIMELINE_PAST_DAYS, 0, -1):
        day = local_today - timedelta(days=offset)
        past.append({"date": day.isoformat(), "activities": counts_by_day.get(day, 0)})
    active_days = sum(1 for d in past if d["activities"] > 0)
    total_activities = sum(d["activities"] for d in past)

    topic_by_id = {t.id: t for t in ordered_topics}
    plan_items = session.exec(
        select(StudyPlanItem)
        .where(StudyPlanItem.exam_id == exam_id)
        .where(StudyPlanItem.completed == False)  # noqa: E712
        .order_by(StudyPlanItem.scheduled_date)
    ).all()

    by_date: dict[date, dict[str, object]] = {}
    for item in plan_items:
        linked = topic_by_id.get(item.topic_id) if item.topic_id else None
        bucket = by_date.setdefault(
            item.scheduled_date,
            {
                "date": item.scheduled_date.isoformat(),
                "is_today": item.scheduled_date == local_today,
                "is_late": item.scheduled_date < local_today,
                "minutes": 0,
                "tasks": [],
            },
        )
        minutes = linked.estimated_minutes if linked else 45
        bucket["minutes"] = int(bucket["minutes"]) + minutes
        tasks = bucket["tasks"]
        assert isinstance(tasks, list)
        tasks.append(
            {
                "id": item.id,
                "kind": "MOCK" if item.task_type == "MOCK_REVIEW" else "STUDY",
                "topic_id": item.topic_id,
                "title": linked.title if linked else item.title,
                "minutes": minutes,
            }
        )

    ordered_days = [by_date[d] for d in sorted(by_date)]
    late = [d for d in ordered_days if d["is_late"]]
    today = next((d for d in ordered_days if d["is_today"]), None)
    upcoming = [d for d in ordered_days if not d["is_late"] and not d["is_today"]][
        :TIMELINE_FUTURE_DAYS
    ]

    projection = (
        project_coverage(
            [
                TopicLoad(
                    id=t.id,
                    title=t.title,
                    minutes=t.estimated_minutes,
                    mastered=t.status == TopicStatus.MASTERED,
                )
                for t in ordered_topics
            ],
            days_left=days_left,
            daily_hours=exam.daily_hours,
        ).as_dict()
        if days_left is not None
        else None
    )

    return {
        "exam": exam,
        "today_date": local_today.isoformat(),
        "days_left": days_left,
        "past": past,
        "past_summary": {
            "days": TIMELINE_PAST_DAYS,
            "active_days": active_days,
            "activities": total_activities,
        },
        "late_days": late,
        "today": today,
        "upcoming": upcoming,
        "projection": projection,
    }


@router.post("/{exam_id}/topics")
def create_custom_topic(
    exam_id: str,
    body: CreateTopicRequest,
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    query = f"{body.title} {body.description}".strip()
    matched_chunks = search_exam_chunks(session, exam_id, query, limit=6)
    seen_pages: set[tuple[str, int]] = set()
    page_refs = []
    for ch in matched_chunks:
        pair = (ch.document_id, ch.page_number)
        if pair not in seen_pages:
            seen_pages.add(pair)
            page_refs.append({"doc_id": ch.document_id, "page": ch.page_number})

    topic = Topic(
        exam_id=exam_id,
        title=body.title.strip(),
        description=body.description.strip() or body.title.strip(),
        priority=body.priority,
        estimated_minutes=body.estimated_minutes,
        source_pages_json=json.dumps(page_refs),
    )
    session.add(topic)
    session.flush()

    plan_item = StudyPlanItem(
        exam_id=exam_id,
        topic_id=topic.id,
        scheduled_date=date.today(),
        task_type="LEARN_TOPIC",
        title=f"[{topic.priority.value}] {topic.title}",
    )
    session.add(plan_item)
    session.commit()
    session.refresh(topic)
    return {"topic": topic, "matched_pages": len(page_refs)}


@router.get("/documents/{doc_id}/pdf")
def get_document_pdf(doc_id: str, session: Session = Depends(get_session)):
    doc = session.get(Document, doc_id)
    if not doc:
        raise DocumentNotFoundError("Il documento non esiste più.")

    uploads_root = settings.uploads_dir.resolve()
    path = Path(doc.file_path).resolve()
    if not path.is_relative_to(uploads_root):
        raise HTTPException(status_code=403, detail="Accesso al file non consentito")
    if not path.exists():
        raise PdfFileMissingError("Il file PDF non è più sul disco.")

    safe_download_stem = sanitize_disk_stem(doc.filename)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{safe_download_stem}.pdf",
        content_disposition_type="inline",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{exam_id}")
def delete_exam(exam_id: str, session: Session = Depends(get_session)):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    delete_exam_fts(session, exam_id)

    for item in session.exec(
        select(StudyPlanItem).where(StudyPlanItem.exam_id == exam_id)
    ).all():
        session.delete(item)

    for ms in session.exec(
        select(MockExamSession).where(MockExamSession.exam_id == exam_id)
    ).all():
        session.delete(ms)

    for card in session.exec(
        select(Flashcard).where(Flashcard.exam_id == exam_id)
    ).all():
        session.delete(card)
    session.flush()

    exam_topics = session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    delete_topic_annotations(session, [t.id for t in exam_topics])
    session.exec(delete(ImportJob).where(col(ImportJob.exam_id) == exam_id))
    for topic in exam_topics:
        for fs in session.exec(
            select(FeynmanSession).where(FeynmanSession.topic_id == topic.id)
        ).all():
            session.delete(fs)
        session.flush()
        session.delete(topic)
    session.flush()

    docs_to_unlink: list[Path] = []
    for doc in session.exec(
        select(Document).where(Document.exam_id == exam_id)
    ).all():
        for chunk in session.exec(
            select(DocumentChunk).where(DocumentChunk.document_id == doc.id)
        ).all():
            session.delete(chunk)
        session.flush()
        docs_to_unlink.append(Path(doc.file_path))
        session.delete(doc)
    session.flush()
    for log in session.exec(
        select(StudyActivityLog).where(StudyActivityLog.exam_id == exam_id)
    ).all():
        session.delete(log)
    session.flush()
    session.delete(exam)
    session.commit()

    uploads_root = settings.uploads_dir.resolve()
    for file_path in docs_to_unlink:
        try:
            resolved = file_path.resolve()
            if resolved.is_relative_to(uploads_root):
                resolved.unlink(missing_ok=True)
        except OSError:
            pass

    return {"deleted": exam_id}


@router.post("/{exam_id}/replan")
def replan_from_today(
    exam_id: str,
    lang: str = "it",
    daily_hours: float | None = Query(default=None, ge=0.5, le=12.0),
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")
    if daily_hours is not None:
        exam.daily_hours = float(daily_hours)
        session.add(exam)

    topics = session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    plan_items = session.exec(
        select(StudyPlanItem).where(StudyPlanItem.exam_id == exam_id)
    ).all()

    completed_topic_ids = {
        item.topic_id for item in plan_items if item.completed and item.topic_id
    }
    for item in plan_items:
        if not item.completed:
            session.delete(item)
    session.flush()

    remaining_topics = [
        t for t in topics
        if not t.excluded
        and t.id not in completed_topic_ids
        and t.status != TopicStatus.MASTERED
    ]
    remaining_ids = {t.id for t in remaining_topics}

    prereqs_map: dict[str, list[str]] = {}
    for t in remaining_topics:
        try:
            raw_ids = json.loads(t.prerequisites_json or "[]")
            prereqs_map[t.id] = [pid for pid in raw_ids if pid in remaining_ids]
        except Exception:
            prereqs_map[t.id] = []

    new_items = build_study_plan(
        exam_id=exam.id,
        topics=remaining_topics,
        prereqs_map=prereqs_map,
        exam_date=exam.exam_date,
        daily_hours=exam.daily_hours,
        include_mock_buffer=True,
        lang=lang,
    )
    for item in new_items:
        session.add(item)

    session.commit()
    return {"exam_id": exam.id, "rescheduled_count": len(new_items), "daily_hours": exam.daily_hours}


@router.get("/{exam_id}/export-notes")
def export_exam_notes(exam_id: str, lang: str = "it", session: Session = Depends(get_session)):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    topics = [
        t
        for t in session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
        if not t.excluded
    ]
    lines = [f"# {exam.title}"]
    meta = [x for x in (exam.university, exam.degree_course, exam.professor) if x]
    if meta:
        lines.append(f"_{' • '.join(meta)}_")
    if exam.web_context_summary:
        overview_hdr = "Course Overview" if lang == "en" else "Panoramica del Corso"
        lines.append(f"\n## {overview_hdr}\n{exam.web_context_summary}")

    for idx, t in enumerate(topics, start=1):
        lines.append(f"\n---\n\n## {idx}. {t.title} [{t.priority.value}]")
        if t.notes_markdown:
            lines.append(f"\n{t.notes_markdown}")
        else:
            empty_note = "Notes not generated yet" if lang == "en" else "Appunti non ancora generati"
            lines.append(f"\n_{t.description}_\n\n*({empty_note})*")

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", exam.title).strip("_") or "syneso_appunti"
    content = "\n".join(lines)
    return Response(
        content=content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}_appunti.md"'},
    )


@router.get("/{exam_id}/export-anki")
def export_exam_anki(exam_id: str, session: Session = Depends(get_session)):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    topics = {
        t.id: t.title
        for t in session.exec(select(Topic).where(Topic.exam_id == exam_id)).all()
    }
    cards = session.exec(select(Flashcard).where(Flashcard.exam_id == exam_id)).all()

    buf = io.StringIO()
    buf.write("#separator:tab\n#html:true\n#tags column:3\n")
    writer = csv.writer(buf, delimiter="\t", quoting=csv.QUOTE_MINIMAL)
    for c in cards:
        front = c.front.replace("\r\n", "\n").replace("\n", "<br>")
        back = c.back.replace("\r\n", "\n").replace("\n", "<br>")
        tag = re.sub(r"[^a-zA-Z0-9_]+", "_", topics.get(c.topic_id, "Syneso")).strip("_")
        writer.writerow([front, back, f"Syneso::{tag}"])

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", exam.title).strip("_") or "syneso_anki"
    return Response(
        content=buf.getvalue(),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}_anki.txt"'},
    )


@router.get("/{exam_id}/calendar.ics")
def export_exam_calendar_ics(
    exam_id: str,
    hour: int = Query(default=9, ge=0, le=23),
    lang: str = "it",
    session: Session = Depends(get_session),
):
    exam = session.get(Exam, exam_id)
    if not exam:
        raise ExamNotFoundError("L'esame non esiste più.")

    plan_items = session.exec(
        select(StudyPlanItem).where(StudyPlanItem.exam_id == exam_id)
    ).all()
    cards = session.exec(select(Flashcard).where(Flashcard.exam_id == exam_id)).all()

    today = date.today()
    now_utc = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    events: list[str] = []

    def add_event(uid: str, day: date, summary: str, desc: str):
        start_dt = datetime(day.year, day.month, day.day, hour, 0, 0)
        end_dt = start_dt + timedelta(minutes=30)
        events.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}@syneso.app",
                f"DTSTAMP:{now_utc}",
                f"DTSTART:{start_dt.strftime('%Y%m%dT%H%M%S')}",
                f"DTEND:{end_dt.strftime('%Y%m%dT%H%M%S')}",
                f"SUMMARY:{summary}",
                f"DESCRIPTION:{desc}",
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                f"DESCRIPTION:{summary}",
                "TRIGGER:-PT15M",
                "END:VALARM",
                "END:VEVENT",
            ]
        )

    cards_per_day: dict[date, int] = {}
    for c in cards:
        d = c.due_at.replace(tzinfo=timezone.utc).astimezone().date()
        eff = today if d <= today else d
        if (eff - today).days <= 30:
            cards_per_day[eff] = cards_per_day.get(eff, 0) + 1

    for d, count in sorted(cards_per_day.items()):
        ev_title = f"[{exam.title}] FSRS Review ({count} cards)" if lang == "en" else f"[{exam.title}] Ripasso FSRS ({count} carte)"
        ev_desc = f"Scheduled Syneso review for {exam.title}." if lang == "en" else f"Ripasso programmato su Syneso per {exam.title}."
        add_event(
            f"fsrs-{exam.id}-{d.isoformat()}",
            d,
            ev_title,
            ev_desc,
        )

    for item in plan_items:
        if not item.completed and item.scheduled_date >= today:
            add_event(
                f"plan-{item.id}",
                item.scheduled_date,
                f"[{exam.title}] {item.title}",
                f"Tabella di marcia Syneso per {exam.title}.",
            )

    ics = "\r\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Syneso//Study Orchestrator//IT",
            *events,
            "END:VCALENDAR",
        ]
    )
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", exam.title).strip("_") or "syneso_calendario"
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{slug}.ics"'},
    )