"""
Percorsi dell'applicazione, senza dipendenze.

Sta a parte da `app.config` perché anche il launcher ne ha bisogno prima di
caricare la configurazione completa.
"""

import os
import shutil
import sys
from pathlib import Path

APP_DIR_NAME = "Syneso"
LEGACY_APP_DIR_NAME = "FeynOS"
LOG_FILE_NAME = "syneso.log"


def platform_data_root() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home()))
    return Path.home() / ".local" / "share"


def get_app_base_dir() -> Path:
    """
    Cartella dei dati dell'app: accanto al codice in sviluppo, nella cartella
    di sistema quando l'app è impacchettata.
    """
    if not getattr(sys, "frozen", False):
        return Path(__file__).resolve().parents[3]

    root = platform_data_root()
    new_dir = root / APP_DIR_NAME
    legacy_dir = root / LEGACY_APP_DIR_NAME
    if not new_dir.exists() and legacy_dir.exists():
        try:
            shutil.copytree(legacy_dir, new_dir)
        except OSError:
            return legacy_dir
    new_dir.mkdir(parents=True, exist_ok=True)
    return new_dir


def get_log_path() -> Path:
    """File di log dell'app, nella stessa cartella dei suoi dati."""
    return get_app_base_dir() / LOG_FILE_NAME
