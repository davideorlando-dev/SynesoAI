"""Test della proiezione: la frase della home è un calcolo, e qui si verifica."""

from app.core.projection import TopicLoad, project_coverage


def topic(name: str, minutes: int, mastered: bool = False) -> TopicLoad:
    return TopicLoad(id=name, title=name, minutes=minutes, mastered=mastered)


def test_tutto_entra_nel_tempo_disponibile():
    p = project_coverage(
        [topic("a", 60), topic("b", 60)],
        days_left=10,
        daily_hours=2,
    )
    assert p.topics_projected == 2
    assert p.covers_everything is True
    assert p.extra_minutes_per_day == 0
    assert p.next_topic_out_of_reach is None


def test_si_ferma_sul_primo_argomento_che_non_entra():
    # 2 giorni x 60 min = 120 minuti disponibili, servono 180.
    p = project_coverage(
        [topic("primo", 60), topic("secondo", 60), topic("terzo", 60)],
        days_left=2,
        daily_hours=1,
    )
    assert p.topics_projected == 2
    assert p.next_topic_out_of_reach == "terzo"
    assert p.required_minutes == 180
    assert p.available_minutes == 120
    # 60 minuti mancanti su 2 giorni.
    assert p.extra_minutes_per_day == 30


def test_gli_argomenti_gia_padroneggiati_contano_ma_non_costano():
    p = project_coverage(
        [topic("fatto", 300, mastered=True), topic("da fare", 60)],
        days_left=1,
        daily_hours=1,
    )
    assert p.topics_mastered == 1
    assert p.topics_projected == 2
    assert p.required_minutes == 60
    assert p.covers_everything is True


def test_esame_domani_nessun_giorno_residuo():
    p = project_coverage([topic("a", 60)], days_left=0, daily_hours=3)
    assert p.available_minutes == 0
    assert p.topics_projected == 0
    assert p.next_topic_out_of_reach == "a"
    # Senza giorni davanti non si può chiedere "tot minuti in più al giorno".
    assert p.extra_minutes_per_day == 0


def test_giorni_negativi_valgono_zero():
    p = project_coverage([topic("a", 60)], days_left=-5, daily_hours=2)
    assert p.days_left == 0
    assert p.available_minutes == 0


def test_nessun_argomento():
    p = project_coverage([], days_left=10, daily_hours=2)
    assert p.topics_total == 0
    assert p.topics_projected == 0
    assert p.covers_everything is True
    assert p.extra_minutes_per_day == 0


def test_minuti_arrotondati_per_eccesso():
    # Mancano 61 minuti su 2 giorni: 30.5 -> 31, per difetto non basterebbe.
    p = project_coverage(
        [topic("a", 181)],
        days_left=2,
        daily_hours=1,
    )
    assert p.required_minutes == 181
    assert p.available_minutes == 120
    assert p.extra_minutes_per_day == 31


def test_minuti_negativi_di_un_argomento_non_regalano_tempo():
    p = project_coverage(
        [topic("rotto", -120), topic("vero", 60)],
        days_left=1,
        daily_hours=1,
    )
    assert p.required_minutes == 60
    assert p.topics_projected == 2


def test_ore_al_giorno_frazionarie():
    p = project_coverage([topic("a", 90)], days_left=1, daily_hours=1.5)
    assert p.daily_minutes == 90
    assert p.covers_everything is True
