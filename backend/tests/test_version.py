"""
La versione è dichiarata una volta sola.

pyproject e package.json ripetono il numero perché i loro formati lo
richiedono. Questo test è ciò che rende vera quella ripetizione: se qualcuno
aggiorna un file e dimentica gli altri, la suite lo dice subito, invece di
lasciare che l'app mostri un numero e l'installer ne usi un altro.
"""

import json
import tomllib
from pathlib import Path

from app.version import APP_VERSION

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_the_version_is_a_release_number():
    parts = APP_VERSION.split(".")
    assert len(parts) == 3, APP_VERSION
    assert all(part.isdigit() for part in parts), APP_VERSION


def test_pyproject_declares_the_same_version():
    pyproject = tomllib.loads(
        (REPO_ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8")
    )
    assert pyproject["project"]["version"] == APP_VERSION


def test_the_frontend_package_declares_the_same_version():
    package = json.loads(
        (REPO_ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    )
    assert package["version"] == APP_VERSION


def test_health_reports_the_version_to_the_interface(client):
    body = client.get("/health").json()

    assert body["version"] == APP_VERSION
    assert body["app"] == "syneso"


def test_settings_report_the_version_to_the_interface(client):
    assert client.get("/api/settings").json()["app_version"] == APP_VERSION
