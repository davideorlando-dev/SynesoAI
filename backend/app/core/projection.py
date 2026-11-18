"""
Proiezione: quanto della materia entra nel tempo che resta.

La home mostra una frase sola ("arrivi all'esame con 4 argomenti su 5") e quella
frase deve essere un calcolo, non un'impressione. Qui c'è il calcolo, puro:
niente database, niente orologio di sistema, tutto passato come argomento, così
è verificabile con un test e riusabile altrove.

Il modello è volutamente semplice e dichiarabile all'utente:
  tempo disponibile = giorni che mancano x ore dichiarate al giorno
  tempo necessario  = minuti stimati degli argomenti non ancora padroneggiati
Gli argomenti si riempiono nell'ordine in cui il piano li affronta (prerequisiti
prima, priorità poi): è lo stesso ordine che l'utente vede nella roadmap, quindi
la proiezione risponde alla domanda "dove arrivo se continuo così".
"""

from __future__ import annotations

import math
from dataclasses import dataclass

MINUTES_PER_HOUR = 60


@dataclass(frozen=True)
class TopicLoad:
    """Un argomento visto dalla proiezione: quanto costa e se è già chiuso."""

    id: str
    title: str
    minutes: int
    mastered: bool


@dataclass(frozen=True)
class Projection:
    days_left: int
    daily_minutes: int
    available_minutes: int
    required_minutes: int
    topics_total: int
    topics_mastered: int
    topics_projected: int
    next_topic_out_of_reach: str | None
    extra_minutes_per_day: int

    @property
    def covers_everything(self) -> bool:
        return self.topics_projected >= self.topics_total

    def as_dict(self) -> dict[str, object]:
        return {
            "days_left": self.days_left,
            "daily_minutes": self.daily_minutes,
            "available_minutes": self.available_minutes,
            "required_minutes": self.required_minutes,
            "topics_total": self.topics_total,
            "topics_mastered": self.topics_mastered,
            "topics_projected": self.topics_projected,
            "next_topic_out_of_reach": self.next_topic_out_of_reach,
            "extra_minutes_per_day": self.extra_minutes_per_day,
            "covers_everything": self.covers_everything,
        }


def project_coverage(
    topics: list[TopicLoad],
    days_left: int,
    daily_hours: float,
) -> Projection:
    """Quanti argomenti entrano nel tempo che resta prima dell'esame.

    `topics` va passato nell'ordine in cui verranno studiati. `days_left` è il
    numero di giorni pieni che mancano all'esame (0 = si dà domani, nessun
    giorno di studio residuo); valori negativi vengono trattati come 0.
    """
    days = max(0, days_left)
    daily_minutes = max(0, round(daily_hours * MINUTES_PER_HOUR))
    available = days * daily_minutes

    mastered = [t for t in topics if t.mastered]
    remaining = [t for t in topics if not t.mastered]
    required = sum(max(0, t.minutes) for t in remaining)

    budget = available
    reachable = 0
    out_of_reach: str | None = None
    for topic in remaining:
        cost = max(0, topic.minutes)
        if cost <= budget:
            budget -= cost
            reachable += 1
        else:
            out_of_reach = topic.title
            break

    missing = max(0, required - available)
    extra_per_day = math.ceil(missing / days) if missing > 0 and days > 0 else 0

    return Projection(
        days_left=days,
        daily_minutes=daily_minutes,
        available_minutes=available,
        required_minutes=required,
        topics_total=len(topics),
        topics_mastered=len(mastered),
        topics_projected=len(mastered) + reachable,
        next_topic_out_of_reach=out_of_reach,
        extra_minutes_per_day=extra_per_day,
    )
