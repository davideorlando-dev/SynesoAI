"""
Logging dell'applicazione.

I messaggi vanno sulla console, quando c'è, e su un file che ruota: il log di
un'app che resta installata per mesi non deve crescere senza limite.
"""

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

ROOT_LOGGER_NAME = "syneso"
MAX_LOG_BYTES = 2 * 1024 * 1024
BACKUP_COUNT = 3
LOG_FORMAT = "%(asctime)s %(levelname)-7s %(name)s %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def get_logger(module_name: str) -> logging.Logger:
    """Logger di un modulo, figlio di quello dell'app."""
    short = module_name.removeprefix("app.")
    return logging.getLogger(f"{ROOT_LOGGER_NAME}.{short}")


def configure_logging(log_path: Path | None = None, level: int = logging.INFO) -> None:
    """
    Prepara il logger dell'app. Chiamarla più volte non aggiunge handler
    duplicati, così test e riavvii non moltiplicano le righe.
    """
    logger = logging.getLogger(ROOT_LOGGER_NAME)
    logger.setLevel(level)
    logger.propagate = False
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
        handler.close()

    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)

    if sys.stderr is not None:
        stream = logging.StreamHandler()
        stream.setFormatter(formatter)
        logger.addHandler(stream)

    if log_path is not None:
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            rotating = RotatingFileHandler(
                log_path,
                maxBytes=MAX_LOG_BYTES,
                backupCount=BACKUP_COUNT,
                encoding="utf-8",
            )
            rotating.setFormatter(formatter)
            logger.addHandler(rotating)
        except OSError as exc:
            # Senza file di log l'app funziona comunque: lo si dice e si prosegue.
            logger.warning("Impossibile scrivere il file di log %s: %s", log_path, exc)
