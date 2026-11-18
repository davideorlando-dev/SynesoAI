import os
from pathlib import Path
import shutil
import sqlite3
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import get_app_base_dir, get_log_path


APP_BASE_DIR = get_app_base_dir()
ENV_FILE_PATH = APP_BASE_DIR / ".env"
LOG_FILE_PATH = get_log_path()


def _restrict_dir_permissions(path: Path) -> None:
    if os.name == "posix":
        try:
            os.chmod(path, 0o700)
        except OSError:
            pass

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    data_dir: Path = APP_BASE_DIR / "data"
    log_path: Path = LOG_FILE_PATH
    llm_model: str = "openai/gpt-oss-120b"
    groq_api_key: str | None = None
    llm_api_key: str | None = None
    llm_num_predict: int = 2560
    enable_web_search: bool = True

    @property
    def db_path(self) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        _restrict_dir_permissions(self.data_dir)
        new_db = self.data_dir / "syneso.db"
        legacy_db = self.data_dir / "feynos.db"
        if not new_db.exists() and legacy_db.exists():
            try:
                with sqlite3.connect(str(legacy_db), timeout=10.0) as src:
                    with sqlite3.connect(str(new_db)) as dst:
                        src.backup(dst)
            except Exception:
                shutil.copy2(legacy_db, new_db)
        return new_db

    @property
    def uploads_dir(self) -> Path:
        path = self.data_dir / "uploads"
        path.mkdir(parents=True, exist_ok=True)
        _restrict_dir_permissions(path)
        return path
    


settings = Settings()