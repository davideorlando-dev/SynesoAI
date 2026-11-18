"""Test dell'endpoint che alimenta la home: /exams/{id}/timeline."""

from datetime import date, timedelta

from sqlmodel import Session

from app.db.models import (
    Exam,
    StudyActivityLog,
    StudyPlanItem,
    Topic,
    TopicStatus,
    utc_now,
)


def seed_exam(engine, *, exam_date: date | None, daily_hours: float = 2.0) -> str:
    with Session(engine) as s:
        exam = Exam(title="Navigazione costiera", exam_date=exam_date, daily_hours=daily_hours)
        s.add(exam)
        s.flush()
        exam_id = exam.id
        s.add(
            Topic(
                exam_id=exam_id,
                title="Punto nave",
                description="",
                estimated_minutes=120,
                status=TopicStatus.READY,
            )
        )
        s.add(
            Topic(
                exam_id=exam_id,
                title="Maree",
                description="",
                estimated_minutes=120,
                status=TopicStatus.MASTERED,
            )
        )
        s.commit()
    return exam_id


def test_timeline_senza_data_esame_non_proietta(isolated_env, client):
    exam_id = seed_exam(isolated_env["engine"], exam_date=None)

    data = client.get(f"/api/exams/{exam_id}/timeline").json()

    assert data["days_left"] is None
    assert data["projection"] is None
    assert len(data["past"]) == 30
    assert data["today"] is None
    assert data["upcoming"] == []


def test_timeline_conta_le_attivita_degli_ultimi_trenta_giorni(isolated_env, client):
    exam_id = seed_exam(isolated_env["engine"], exam_date=date.today() + timedelta(days=20))
    with Session(isolated_env["engine"]) as s:
        s.add(StudyActivityLog(exam_id=exam_id, created_at=utc_now() - timedelta(days=2)))
        s.add(StudyActivityLog(exam_id=exam_id, created_at=utc_now() - timedelta(days=2)))
        s.add(StudyActivityLog(exam_id=exam_id, created_at=utc_now() - timedelta(days=5)))
        # Fuori finestra: non deve comparire.
        s.add(StudyActivityLog(exam_id=exam_id, created_at=utc_now() - timedelta(days=90)))
        s.commit()

    data = client.get(f"/api/exams/{exam_id}/timeline").json()

    assert data["past_summary"]["activities"] == 3
    assert data["past_summary"]["active_days"] == 2
    assert data["past_summary"]["days"] == 30
    # L'ultimo giorno del passato è ieri, non oggi.
    assert data["past"][-1]["date"] == (date.today() - timedelta(days=1)).isoformat()


def test_timeline_divide_arretrati_oggi_e_prossimi_giorni(isolated_env, client):
    exam_id = seed_exam(isolated_env["engine"], exam_date=date.today() + timedelta(days=20))
    today = date.today()
    with Session(isolated_env["engine"]) as s:
        s.add(
            StudyPlanItem(
                exam_id=exam_id, scheduled_date=today - timedelta(days=3), title="Arretrato"
            )
        )
        s.add(StudyPlanItem(exam_id=exam_id, scheduled_date=today, title="Oggi A"))
        s.add(StudyPlanItem(exam_id=exam_id, scheduled_date=today, title="Oggi B"))
        s.add(
            StudyPlanItem(
                exam_id=exam_id, scheduled_date=today + timedelta(days=1), title="Domani"
            )
        )
        s.add(
            StudyPlanItem(
                exam_id=exam_id,
                scheduled_date=today + timedelta(days=2),
                title="Fatto",
                completed=True,
            )
        )
        s.commit()

    data = client.get(f"/api/exams/{exam_id}/timeline").json()

    assert [d["date"] for d in data["late_days"]] == [(today - timedelta(days=3)).isoformat()]
    assert data["today"]["date"] == today.isoformat()
    assert len(data["today"]["tasks"]) == 2
    # Senza topic collegato il piano vale il valore di riserva, 45 minuti a voce.
    assert data["today"]["minutes"] == 90
    assert [d["date"] for d in data["upcoming"]] == [(today + timedelta(days=1)).isoformat()]


def test_timeline_proietta_sui_minuti_degli_argomenti(isolated_env, client):
    # 2 giorni x 1 ora = 120 minuti; manca solo "Punto nave" e costa 120.
    exam_id = seed_exam(
        isolated_env["engine"], exam_date=date.today() + timedelta(days=2), daily_hours=1.0
    )

    projection = client.get(f"/api/exams/{exam_id}/timeline").json()["projection"]

    assert projection["days_left"] == 2
    assert projection["topics_total"] == 2
    assert projection["topics_mastered"] == 1
    assert projection["topics_projected"] == 2
    assert projection["covers_everything"] is True
    assert projection["extra_minutes_per_day"] == 0


def test_timeline_dice_quanti_minuti_in_piu_servono(isolated_env, client):
    # 1 giorno x 1 ora = 60 minuti disponibili, ne servono 120.
    exam_id = seed_exam(
        isolated_env["engine"], exam_date=date.today() + timedelta(days=1), daily_hours=1.0
    )

    projection = client.get(f"/api/exams/{exam_id}/timeline").json()["projection"]

    assert projection["topics_projected"] == 1
    assert projection["covers_everything"] is False
    assert projection["next_topic_out_of_reach"] == "Punto nave"
    assert projection["extra_minutes_per_day"] == 60


def test_timeline_esame_inesistente(client):
    res = client.get("/api/exams/non-esiste/timeline")
    assert res.status_code == 404
    assert res.json()["code"] == "exam_not_found"
