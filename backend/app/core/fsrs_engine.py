from datetime import date, datetime, time, timedelta, timezone
from importlib.metadata import version as pkg_version
from fsrs import Card, Rating, Scheduler

try:
    FSRS_VERSION = pkg_version("fsrs")
except Exception:
    FSRS_VERSION = "unknown"


def _local_tz():
    return datetime.now().astimezone().tzinfo or timezone.utc


def _local_today() -> date:
    return datetime.now(_local_tz()).date()


def _pre_exam_cutoff_utc(exam_date: date | None) -> datetime | None:
    if not exam_date:
        return None
    tz = _local_tz()
    today_local = datetime.now(tz).date()
    if exam_date <= today_local:
        return None

    now_utc = datetime.now(timezone.utc)
    evening_before = datetime.combine(
        exam_date - timedelta(days=1), time(20, 0), tzinfo=tz
    ).astimezone(timezone.utc)
    if evening_before > now_utc:
        return evening_before

    exam_morning = datetime.combine(
        exam_date, time(8, 0), tzinfo=tz
    ).astimezone(timezone.utc)
    if exam_morning > now_utc:
        return exam_morning

    return None


def _load_card(card_json: str) -> Card:
    if not card_json or card_json.strip() in ("", "{}"):
        return Card()
    try:
        return Card.from_json(card_json)
    except Exception:
        return Card()


def build_scheduler(
    exam_date: date | None = None,
    enable_fuzzing: bool = True,
) -> Scheduler:
    max_interval = 365
    desired_retention = 0.9

    if exam_date:
        days_left = (exam_date - _local_today()).days
        if days_left > 0:
            max_interval = max(1, min(365, days_left - 1 if days_left > 1 else 1))
            if days_left <= 7:
                desired_retention = 0.92

    return Scheduler(
        desired_retention=desired_retention,
        maximum_interval=max_interval,
        enable_fuzzing=enable_fuzzing,
    )


def create_new_fsrs_card_json() -> str:
    return Card().to_json()


def review_fsrs_card(
    card_json: str,
    rating_value: int,
    exam_date: date | None = None,
    enable_fuzzing: bool = True,
) -> tuple[str, datetime]:
    scheduler = build_scheduler(exam_date, enable_fuzzing=enable_fuzzing)
    card = _load_card(card_json)
    rating = Rating(rating_value)

    updated_card, _ = scheduler.review_card(card, rating)

    cutoff_utc = _pre_exam_cutoff_utc(exam_date)
    if cutoff_utc and updated_card.due > cutoff_utc:
        updated_card.due = cutoff_utc

    return updated_card.to_json(), updated_card.due


def _format_interval(due_utc: datetime, lang: str = "it") -> str:
    now = datetime.now(timezone.utc)
    seconds = max(60, int((due_utc - now).total_seconds()))
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h"
    days = max(1, round(hours / 24))
    if lang == "en":
        if days < 14:
            return f"{days}d"
        if days < 60:
            return f"{round(days / 7)}w"
        return f"{round(days / 30)}mo"
    if days < 14:
        return f"{days}g"
    if days < 60:
        return f"{round(days / 7)} sett"
    return f"{round(days / 30)} mesi"


def preview_fsrs_intervals(
    card_json: str, exam_date: date | None = None, lang: str = "it"
) -> dict[str, str]:
    previews: dict[str, str] = {}
    for r in (1, 2, 3, 4):
        try:
            _, due = review_fsrs_card(
                card_json, r, exam_date=exam_date, enable_fuzzing=False
            )
            previews[str(r)] = _format_interval(due, lang=lang)
        except Exception:
            previews[str(r)] = "-"
    return previews


def compute_exam_retention_pct(
    cards_json: list[str], exam_date: date | None = None
) -> tuple[int | None, int]:
    scheduler = build_scheduler(exam_date, enable_fuzzing=False)
    retrievabilities: list[float] = []
    for raw in cards_json:
        card = _load_card(raw)
        if card.last_review is None:
            continue
        try:
            r = scheduler.get_card_retrievability(card)
            retrievabilities.append(max(0.0, min(1.0, float(r))))
        except Exception:
            continue
    if not retrievabilities:
        return None, 0
    avg_pct = round(100.0 * sum(retrievabilities) / len(retrievabilities))
    return avg_pct, len(retrievabilities)


def estimate_fsrs_retention(
    card_jsons: list[str], exam_date: date | None = None
) -> int | None:
    avg_pct, _ = compute_exam_retention_pct(card_jsons, exam_date=exam_date)
    return avg_pct