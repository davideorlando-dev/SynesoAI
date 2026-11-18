import heapq
import math
from datetime import date, timedelta
from app.db.models import StudyPlanItem, Topic, TopicPriority

PRIORITY_RANK = {
    TopicPriority.CORE: 0,
    TopicPriority.IMPORTANT: 1,
    TopicPriority.DETAIL: 2,
}


def topological_prioritized_order(
    topics: list[Topic], prereqs_map: dict[str, list[str]]
) -> list[Topic]:
    topic_by_id = {t.id: t for t in topics}
    in_degree = {t.id: 0 for t in topics}
    dependents: dict[str, list[str]] = {t.id: [] for t in topics}

    for t in topics:
        for pre_id in prereqs_map.get(t.id, []):
            if pre_id in topic_by_id and pre_id != t.id:
                in_degree[t.id] += 1
                dependents[pre_id].append(t.id)

    heap: list[tuple[int, int, str]] = []
    for idx, t in enumerate(topics):
        if in_degree[t.id] == 0:
            heapq.heappush(heap, (PRIORITY_RANK[t.priority], idx, t.id))

    ordered: list[Topic] = []
    visited: set[str] = set()

    while heap:
        _, _, tid = heapq.heappop(heap)
        if tid in visited:
            continue
        visited.add(tid)
        ordered.append(topic_by_id[tid])

        for dep_id in dependents[tid]:
            in_degree[dep_id] -= 1
            if in_degree[dep_id] == 0:
                dep_topic = topic_by_id[dep_id]
                heapq.heappush(
                    heap, (PRIORITY_RANK[dep_topic.priority], len(ordered), dep_id)
                )

    if len(ordered) < len(topics):
        remaining = [t for t in topics if t.id not in visited]
        remaining.sort(key=lambda t: PRIORITY_RANK[t.priority])
        ordered.extend(remaining)

    return ordered


def build_study_plan(
    exam_id: str,
    topics: list[Topic],
    prereqs_map: dict[str, list[str]],
    exam_date: date | None,
    daily_hours: float = 2.0,
    include_mock_buffer: bool = True,
    lang: str = "it",
) -> list[StudyPlanItem]:
    ordered_topics = topological_prioritized_order(topics, prereqs_map)
    today = date.today()
    daily_minutes = max(30, int(round(daily_hours * 60)))
    total_minutes = sum(t.estimated_minutes for t in ordered_topics)

    if exam_date and exam_date > today:
        total_days = (exam_date - today).days
        buffer_days = min(5, max(1, int(total_days * 0.15))) if total_days >= 3 else 0
        study_days = max(1, total_days - buffer_days)
    else:
        study_days = max(1, math.ceil(total_minutes / daily_minutes)) if total_minutes else 1
        buffer_days = 0

    plan: list[StudyPlanItem] = []
    last_topic_day_idx = 0

    if ordered_topics:
        needed_days = max(1, math.ceil(total_minutes / daily_minutes))
        if exam_date and exam_date > today and needed_days > study_days:
            max_per_day = max(daily_minutes, math.ceil(total_minutes / study_days))
        else:
            max_per_day = daily_minutes

        if max_per_day < 45 and not (exam_date and exam_date > today and needed_days > study_days):
            cum_minutes = 0
            for topic in ordered_topics:
                day_idx = min(study_days - 1, cum_minutes // max_per_day)
                last_topic_day_idx = max(last_topic_day_idx, day_idx)
                plan.append(
                    StudyPlanItem(
                        exam_id=exam_id,
                        topic_id=topic.id,
                        scheduled_date=today + timedelta(days=day_idx),
                        task_type="LEARN_TOPIC",
                        title=f"[{topic.priority.value}] {topic.title}",
                    )
                )
                cum_minutes += topic.estimated_minutes
        else:
            current_day_idx = 0
            minutes_used_today = 0
            for topic in ordered_topics:
                if (
                    minutes_used_today > 0
                    and minutes_used_today + topic.estimated_minutes > max_per_day
                    and current_day_idx < study_days - 1
                ):
                    current_day_idx += 1
                    minutes_used_today = 0

                last_topic_day_idx = max(last_topic_day_idx, current_day_idx)
                plan.append(
                    StudyPlanItem(
                        exam_id=exam_id,
                        topic_id=topic.id,
                        scheduled_date=today + timedelta(days=current_day_idx),
                        task_type="LEARN_TOPIC",
                        title=f"[{topic.priority.value}] {topic.title}",
                    )
                )
                minutes_used_today += topic.estimated_minutes

    if include_mock_buffer:
        if exam_date and exam_date > today and (study_days - last_topic_day_idx) >= 7:
            gap_day = last_topic_day_idx + 5
            while gap_day <= study_days - 3:
                chk_title = (
                    "Checkpoint: Ripasso FSRS e Verifica Lacune"
                    if lang != "en"
                    else "Checkpoint: FSRS Review & Gap Check"
                )
                plan.append(
                    StudyPlanItem(
                        exam_id=exam_id,
                        topic_id=None,
                        scheduled_date=today + timedelta(days=gap_day),
                        task_type="MOCK_REVIEW",
                        title=chk_title,
                    )
                )
                gap_day += 6

        for b in range(buffer_days):
            review_day = today + timedelta(days=study_days + b)
            if lang == "en":
                label = (
                    f"Final Review {b + 1}/{buffer_days}: "
                    + (
                        "Full Mock Exam + FSRS Review"
                        if b == buffer_days - 1
                        else "Intensive FSRS & Feynman Gap Review"
                    )
                )
            else:
                label = (
                    f"Ripasso Finale {b + 1}/{buffer_days}: "
                    + (
                        "Simulazione Esame Generale + Ripasso FSRS"
                        if b == buffer_days - 1
                        else "Ripasso Intensivo FSRS e Lacune Feynman"
                    )
                )
            plan.append(
                StudyPlanItem(
                    exam_id=exam_id,
                    topic_id=None,
                    scheduled_date=review_day,
                    task_type="MOCK_REVIEW",
                    title=label,
                )
            )

    return plan
