#!/usr/bin/env python3
"""
Stampa la versione di Syneso.

Esiste perché i workflow girano su macOS, Windows e Linux e hanno bisogno di
leggere lo stesso numero senza che ciascuno si inventi il proprio modo di
estrarlo: così la fonte resta `backend/app/version.py` anche fuori da Python.

Uso:  python scripts/app_version.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.version import APP_VERSION

if __name__ == "__main__":
    print(APP_VERSION)
