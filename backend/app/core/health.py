"""
Identità dell'istanza locale di Syneso.

L'endpoint /health dichiara quale applicazione sta rispondendo, così il
launcher può distinguere un'istanza di Syneso già avviata da un qualunque altro
servizio in ascolto sulla stessa porta. Solo libreria standard: il launcher
importa questo modulo prima di caricare il resto dell'applicazione.
"""

import json
import time
import urllib.request
from collections.abc import Callable

from app.version import APP_VERSION

APP_ID = "syneso"
HEALTH_PATH = "/health"
_MAX_HEALTH_BODY_BYTES = 4096


def health_payload() -> dict[str, str]:
    return {"status": "ok", "app": APP_ID, "version": APP_VERSION}


def is_syneso_health_body(raw: bytes) -> bool:
    try:
        data = json.loads(raw)
    except ValueError:
        return False
    return (
        isinstance(data, dict)
        and data.get("status") == "ok"
        and data.get("app") == APP_ID
    )


def probe_syneso(base_url: str, timeout_s: float = 0.6) -> bool:
    """True solo se a `base_url` risponde un'istanza di Syneso."""
    try:
        with urllib.request.urlopen(f"{base_url}{HEALTH_PATH}", timeout=timeout_s) as res:
            return res.status == 200 and is_syneso_health_body(
                res.read(_MAX_HEALTH_BODY_BYTES)
            )
    except (OSError, ValueError):
        return False


def wait_until_ready(
    base_url: str,
    timeout_s: float,
    should_abort: Callable[[], bool] = lambda: False,
    poll_interval_s: float = 0.15,
) -> bool:
    """
    Attende che Syneso risponda a `base_url`.

    Restituisce False allo scadere del tempo, oppure subito se `should_abort`
    segnala che l'attesa è inutile (ad esempio il server è terminato).
    """
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if probe_syneso(base_url, timeout_s=0.5):
            return True
        if should_abort():
            return False
        time.sleep(poll_interval_s)
    return False
