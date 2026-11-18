import logging

from app.core.logging_setup import ROOT_LOGGER_NAME, configure_logging, get_logger


def _root() -> logging.Logger:
    return logging.getLogger(ROOT_LOGGER_NAME)


def test_module_logger_is_a_child_of_the_app_logger():
    assert get_logger("app.agents.mapper").name == "syneso.agents.mapper"
    assert get_logger("app.core.llm").name == "syneso.core.llm"


def test_messages_are_written_to_the_log_file(tmp_path):
    log_path = tmp_path / "logs" / "syneso.log"

    configure_logging(log_path)
    get_logger("app.test").info("riga di prova")
    for handler in _root().handlers:
        handler.flush()

    assert "riga di prova" in log_path.read_text(encoding="utf-8")


def test_configuring_twice_does_not_duplicate_handlers(tmp_path):
    log_path = tmp_path / "syneso.log"

    configure_logging(log_path)
    first = len(_root().handlers)
    configure_logging(log_path)

    assert len(_root().handlers) == first
    get_logger("app.test").info("una sola volta")
    for handler in _root().handlers:
        handler.flush()
    assert log_path.read_text(encoding="utf-8").count("una sola volta") == 1


def test_the_log_file_rotates_instead_of_growing_without_limit(tmp_path, monkeypatch):
    import app.core.logging_setup as logging_setup

    monkeypatch.setattr(logging_setup, "MAX_LOG_BYTES", 1024)
    log_path = tmp_path / "syneso.log"

    configure_logging(log_path)
    log = get_logger("app.test")
    for i in range(200):
        log.info("riga lunga di prova numero %d %s", i, "x" * 80)
    for handler in _root().handlers:
        handler.flush()

    assert log_path.exists()
    assert log_path.stat().st_size <= 4096
    assert list(tmp_path.glob("syneso.log.*")), "nessun file ruotato"


def test_an_unwritable_log_path_does_not_stop_the_app(tmp_path):
    blocked = tmp_path / "file"
    blocked.write_text("non è una cartella", encoding="utf-8")

    configure_logging(blocked / "syneso.log")

    get_logger("app.test").info("l'app continua a funzionare")
