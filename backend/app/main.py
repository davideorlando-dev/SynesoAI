from contextlib import asynccontextmanager
import os
from pathlib import Path
import re
import sys
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.annotations import router as annotations_router
from app.api.exams import router as exams_router
from app.api.imports import router as imports_router
from app.api.study import router as study_router
from app.config import ENV_FILE_PATH, settings
from app.core.errors import SynesoError
from app.core.llm import test_groq_connection
from app.db.database import create_db_backup, init_db
from app.core.health import health_payload
from app.core.logging_setup import configure_logging, get_logger
from app.version import APP_VERSION
from app.services.import_jobs import recover_interrupted_imports

log = get_logger("app.main")

LOCAL_ORIGIN_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")
LOCAL_HOST_RE = re.compile(r"^(localhost|127\.0\.0\.1|testserver)(:\d+)?$", re.I)
MODEL_ID_RE = re.compile(r"^[A-Za-z0-9_./:-]{2,80}$")


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging(settings.log_path)
    log.info("Syneso avviato (dati in %s)", settings.data_dir)
    init_db()
    recovered = recover_interrupted_imports()
    if recovered:
        log.warning("Import interrotti ripuliti all'avvio: %d", recovered)
    yield


app = FastAPI(title="Syneso Cloud API", version=APP_VERSION, lifespan=lifespan)

async def report_unexpected_errors(request: Request, call_next):
    """
    Trasforma un errore imprevisto in una risposta che l'interfaccia capisce.

    Senza questo, un'eccezione non gestita viene convertita in un 500 dal
    livello più esterno di Starlette, che sta fuori dal middleware CORS: la
    risposta non porta le intestazioni CORS, il browser la scarta come errore
    di rete e l'utente vede un fallimento di connessione invece di un
    messaggio. Questo middleware viene registrato prima di quello CORS, quindi
    gli sta dentro, e la sua risposta esce con le intestazioni giuste.

    Gli errori previsti non passano da qui: SynesoError e HTTPException li
    gestiscono i loro handler, più in profondità nello stack.
    """
    try:
        return await call_next(request)
    except Exception:
        log.exception("Errore non gestito su %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Errore interno dell'applicazione. Il dettaglio è nel log.",
                "code": "internal_error",
            },
        )


# Registrato prima di CORSMiddleware perché gli stia dentro: l'ordine qui
# decide se la risposta d'errore arriva al browser con le intestazioni CORS.
app.add_middleware(BaseHTTPMiddleware, dispatch=report_unexpected_errors)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def security_guard_middleware(request: Request, call_next):
    host = (request.headers.get("host") or "").strip()
    if host and not LOCAL_HOST_RE.match(host):
        return JSONResponse(status_code=403, content={"detail": "Host non autorizzato."})
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and not LOCAL_ORIGIN_RE.match(origin):
            return JSONResponse(
                status_code=403,
                content={"detail": "Origine non autorizzata."},
            )

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault(
        "Content-Security-Policy",
        "frame-ancestors 'self' http://localhost:3000 http://127.0.0.1:3000",
    )
    return response


@app.exception_handler(SynesoError)
async def syneso_error_handler(_: Request, exc: SynesoError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": str(exc), "code": exc.code},
    )


app.include_router(exams_router, prefix="/api")
app.include_router(study_router, prefix="/api")
app.include_router(annotations_router, prefix="/api")
app.include_router(imports_router, prefix="/api")


class SettingsUpdateRequest(BaseModel):
    groq_api_key: str | None = None
    llm_model: str | None = None
    enable_web_search: bool | None = None


def _sanitize_env_value(value: str) -> str:
    return re.sub(r"[\r\n\x00]+", "", value).strip()


def _persist_env_vars(updates: dict[str, str]) -> None:
    env_path = ENV_FILE_PATH
    env_path.parent.mkdir(parents=True, exist_ok=True)
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    remaining = {k: _sanitize_env_value(v) for k, v in updates.items()}
    new_lines: list[str] = []
    for line in lines:
        s = line.strip()
        if not s or s.startswith("#") or "=" not in line:
            new_lines.append(line)
            continue
        k = line.split("=", 1)[0].strip()
        new_lines.append(f"{k}={remaining.pop(k)}" if k in remaining else line)
    for k, v in remaining.items():
        new_lines.append(f"{k}={v}")
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    if os.name == "posix":
        try:
            os.chmod(env_path, 0o600)
        except OSError:
            pass


@app.get("/health")
def health():
    return health_payload()


@app.get("/api/settings")
def get_app_settings():
    raw_key = (settings.groq_api_key or settings.llm_api_key or "").strip()
    has_key = bool(raw_key and "incolla_qui" not in raw_key and "LA_TUA_CHIAVE" not in raw_key)
    masked = f"{raw_key[:6]}...{raw_key[-4:]}" if has_key and len(raw_key) > 12 else ("***" if has_key else "")
    return {
        "app_version": APP_VERSION,
        "has_api_key": has_key,
        "api_key_masked": masked,
        "llm_model": settings.llm_model,
        "enable_web_search": settings.enable_web_search,
        "available_models": [
            {"id": "openai/gpt-oss-120b", "label": "GPT-OSS 120B (Consigliato • Massima qualità)"},
            {"id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B (Ultra-veloce • 1000 tok/s)"},
            {"id": "qwen/qwen3.8-27b", "label": "Qwen 3.8 27B (Ottimo per Italiano)"},
        ],
    }


@app.post("/api/settings")
def update_app_settings(body: SettingsUpdateRequest):
    updates: dict[str, str] = {}
    if body.groq_api_key is not None and body.groq_api_key.strip():
        raw_key = body.groq_api_key.strip()
        if any(ch in raw_key for ch in ("\r", "\n", "\x00")) or any(ch.isspace() for ch in raw_key):
            raise HTTPException(status_code=400, detail="Formato API Key non valido.")
        if len(raw_key) < 10:
            raise HTTPException(status_code=400, detail="API Key troppo corta.")
        settings.groq_api_key = raw_key
        updates["GROQ_API_KEY"] = raw_key
    if body.llm_model is not None and body.llm_model.strip():
        model_val = _sanitize_env_value(body.llm_model)
        if not MODEL_ID_RE.match(model_val):
            raise HTTPException(status_code=400, detail="Identificativo modello non valido.")
        settings.llm_model = model_val
        updates["LLM_MODEL"] = model_val
    if body.enable_web_search is not None:
        settings.enable_web_search = body.enable_web_search
        updates["ENABLE_WEB_SEARCH"] = "true" if body.enable_web_search else "false"
    if updates:
        _persist_env_vars(updates)
    return get_app_settings()


class SettingsTestRequest(BaseModel):
    groq_api_key: str | None = None
    llm_model: str | None = None


@app.post("/api/settings/test")
def test_app_settings(body: SettingsTestRequest):
    try:
        return test_groq_connection(
            api_key=body.groq_api_key,
            model=body.llm_model,
        )
    except SynesoError:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/settings/backup")
def trigger_manual_backup():
    try:
        path = create_db_backup(reason="manual", keep=5)
        if path is None:
            return {"created": False, "path": None}
        return {"created": True, "filename": path.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup fallito: {e}") from e


def _resolve_static_dir() -> Path | None:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        candidate = Path(sys._MEIPASS) / "frontend_out"
        if candidate.exists():
            return candidate
    dev_out = Path(__file__).resolve().parents[2] / "frontend" / "out"
    return dev_out if dev_out.exists() else None


_static_dir = _resolve_static_dir()
if _static_dir is not None:
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="frontend")