from collections.abc import Iterator
import json
import re
import time
from typing import Type, TypeVar
import httpx
from pydantic import BaseModel, ValidationError
from app.config import settings
from app.core.logging_setup import get_logger
from app.core.errors import (
    LLMInvalidResponseError,
    LLMKeyInvalidError,
    LLMKeyMissingError,
    LLMRateLimitedError,
    LLMUpstreamError,
)

log = get_logger("app.core.llm")

T = TypeVar("T", bound=BaseModel)

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def _extract_json_block(text: str) -> str:
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if match:
        return match.group(1)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        return cleaned[start : end + 1]
    return cleaned


def _get_groq_key() -> str:
    api_key = (settings.groq_api_key or settings.llm_api_key or "").strip()
    if not api_key or "incolla_qui" in api_key or "LA_TUA_CHIAVE" in api_key:
        raise LLMKeyMissingError("Manca una GROQ_API_KEY valida nelle Impostazioni.")
    return api_key


def _model_name() -> str:
    return settings.llm_model.removeprefix("groq/")


THINKING_MAX_TOKENS = 3500
MAX_COMPLETION_TOKENS = 8192


def _reasoning_effort_for(model: str, think: bool) -> str | None:
    m = model.lower()
    if "gpt-oss" in m:
        return "medium" if think else "low"
    if "qwen3" in m:
        return "medium" if think else "none"
    return None


def _parse_retry_after(header_value: str | None, attempt: int) -> float:
    default_wait = min(15.0, 2.0 * (attempt + 1))
    if not header_value:
        return default_wait
    try:
        return min(20.0, max(1.0, float(header_value.strip())))
    except ValueError:
        return default_wait


def _extract_groq_error(res: httpx.Response) -> str:
    try:
        err = res.json().get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
    except Exception:
        pass
    return f"Errore HTTP {res.status_code} da Groq"


def _upstream_error(res: httpx.Response) -> LLMUpstreamError:
    error_cls = LLMRateLimitedError if res.status_code == 429 else LLMUpstreamError
    return error_cls(_extract_groq_error(res))


def _groq_post_with_retry(payload: dict, timeout: float = 120.0) -> dict:
    headers = {
        "Authorization": f"Bearer {_get_groq_key()}",
        "Content-Type": "application/json",
    }
    last_error: Exception | None = None
    for attempt in range(3):
        t0 = time.perf_counter()
        try:
            res = httpx.post(GROQ_CHAT_URL, headers=headers, json=payload, timeout=timeout)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = exc
            if attempt < 2:
                wait_s = 1.5 * (attempt + 1)
                log.warning(f"⏳ [Groq] Errore di rete ({exc}), riprovo tra {wait_s:.1f}s ({attempt + 1}/3)...")
                time.sleep(wait_s)
                continue
            raise LLMUpstreamError(f"Connessione a Groq fallita dopo 3 tentativi: {exc}") from exc

        if res.status_code == 401:
            raise LLMKeyInvalidError("Chiave API Groq non valida o scaduta. Controllala nelle Impostazioni.")
        if res.status_code in RETRYABLE_STATUS_CODES:
            if attempt < 2:
                wait_s = _parse_retry_after(res.headers.get("retry-after"), attempt)
                log.warning(f"⏳ [Groq] HTTP {res.status_code}, riprovo tra {wait_s:.1f}s ({attempt + 1}/3)...")
                time.sleep(wait_s)
                continue
            raise _upstream_error(res)
        if res.status_code >= 400:
            raise _upstream_error(res)

        data = res.json()
        elapsed = max(1e-6, time.perf_counter() - t0)
        usage = data.get("usage", {})
        out_tok = usage.get("completion_tokens", 0)
        in_tok = usage.get("prompt_tokens", 0)
        log.info(
            f"⚡ [Groq] model={payload['model']} | "
            f"prompt={in_tok}tok | gen={out_tok}tok ({out_tok / elapsed:.0f} tok/s)"
        )
        return data

    raise LLMUpstreamError(f"Richiesta Groq fallita dopo 3 tentativi: {last_error}")


def call_llm_structured(
    system_prompt: str,
    user_prompt: str,
    schema: Type[T],
    think: bool | None = None,
    max_tokens: int | None = None,
) -> T:
    """
    `max_tokens` fissa il limite di output per le risposte che si sanno lunghe;
    se omesso vale il default, più alto quando il ragionamento è attivo.
    """
    schema_dict = schema.model_json_schema()
    schema_json = json.dumps(schema_dict, separators=(",", ":"))
    full_system = (
        f"{system_prompt}\n\n"
        f"You MUST respond ONLY with a valid JSON object matching this JSON Schema:\n"
        f"```json\n{schema_json}\n```"
    )

    model = _model_name()
    use_think = bool(think)
    default_max_tokens = THINKING_MAX_TOKENS if use_think else settings.llm_num_predict
    base_max_tokens = min(MAX_COMPLETION_TOKENS, max_tokens or default_max_tokens)
    payload: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": full_system},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2 if use_think else 0.1,
        "max_tokens": base_max_tokens,
        "response_format": {"type": "json_object"},
    }
    effort = _reasoning_effort_for(model, use_think)
    if effort:
        payload["reasoning_effort"] = effort

    last_exc: Exception | None = None
    for attempt in range(2):
        data = _groq_post_with_retry(payload)
        choices = data.get("choices") or []
        if not choices:
            last_exc = LLMInvalidResponseError("Risposta vuota da Groq (choices assente)")
            continue
        choice = choices[0]
        raw_content = choice.get("message", {}).get("content") or "{}"
        finish_reason = choice.get("finish_reason")
        try:
            return schema.model_validate_json(_extract_json_block(raw_content))
        except (ValidationError, json.JSONDecodeError) as e:
            last_exc = e
            log.warning(f"⚠️ [Groq] JSON non valido al tentativo {attempt + 1}/2 (finish={finish_reason}), riprovo...")
            if finish_reason == "length":
                payload["max_tokens"] = min(
                    MAX_COMPLETION_TOKENS, int(payload["max_tokens"]) * 2
                )
                payload["messages"] = [
                    {"role": "system", "content": full_system},
                    {
                        "role": "user",
                        "content": f"{user_prompt}\n\nKeep the JSON concise so it fits cleanly within the token limit.",
                    },
                ]
            else:
                payload["messages"].append({"role": "assistant", "content": raw_content})
                payload["messages"].append(
                    {
                        "role": "user",
                        "content": f"Your previous JSON failed validation ({e}). Return ONLY valid JSON matching the exact schema.",
                    }
                )
    raise LLMInvalidResponseError(f"Risposta JSON non valida dal modello: {last_exc}")


def stream_llm_text(
    system_prompt: str,
    user_prompt: str,
    think: bool = False,
) -> Iterator[str]:
    headers = {
        "Authorization": f"Bearer {_get_groq_key()}",
        "Content-Type": "application/json",
    }
    model = _model_name()
    payload: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": settings.llm_num_predict,
        "stream": True,
    }
    effort = _reasoning_effort_for(model, think)
    if effort:
        payload["reasoning_effort"] = effort

    yielded_any = False
    for attempt in range(3):
        try:
            with httpx.stream("POST", GROQ_CHAT_URL, headers=headers, json=payload, timeout=120.0) as res:
                if res.status_code == 401:
                    raise LLMKeyInvalidError("Chiave API Groq non valida o scaduta.")
                if res.status_code in RETRYABLE_STATUS_CODES and attempt < 2 and not yielded_any:
                    wait_s = _parse_retry_after(res.headers.get("retry-after"), attempt)
                    log.warning(f"⏳ [Groq Stream] HTTP {res.status_code}, riprovo tra {wait_s:.1f}s...")
                    time.sleep(wait_s)
                    continue
                if res.status_code >= 400:
                    res.read()
                    raise _upstream_error(res)

                for line in res.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    delta = (chunk.get("choices") or [{}])[0].get("delta", {})
                    token = delta.get("content") or ""
                    if token:
                        yielded_any = True
                        yield token
                return
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if attempt < 2 and not yielded_any:
                wait_s = 1.5 * (attempt + 1)
                log.warning(f"⏳ [Groq Stream] Errore di rete ({exc}), riprovo tra {wait_s:.1f}s...")
                time.sleep(wait_s)
                continue
            raise LLMUpstreamError(f"Streaming Groq interrotto: {exc}") from exc


def transcribe_audio_with_groq(
    audio_bytes: bytes,
    filename: str = "recording.webm",
    content_type: str = "audio/webm",
    language: str | None = "auto",
) -> str:
    headers = {"Authorization": f"Bearer {_get_groq_key()}"}
    files = {"file": (filename, audio_bytes, content_type)}
    data = {
        "model": "whisper-large-v3-turbo",
        "response_format": "json",
    }
    if language and language != "auto":
        data["language"] = language
    for attempt in range(3):
        try:
            res = httpx.post(GROQ_AUDIO_URL, headers=headers, files=files, data=data, timeout=60.0)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise LLMUpstreamError(f"Trascrizione audio fallita: {exc}") from exc

        if res.status_code == 401:
            raise LLMKeyInvalidError("Chiave API Groq non valida o scaduta.")
        if res.status_code in RETRYABLE_STATUS_CODES and attempt < 2:
            wait_s = _parse_retry_after(res.headers.get("retry-after"), attempt)
            time.sleep(wait_s)
            continue
        if res.status_code >= 400:
            raise _upstream_error(res)
        return (res.json().get("text") or "").strip()
    return ""


def test_groq_connection(api_key: str | None = None, model: str | None = None) -> dict:
    key = (api_key or "").strip() or _get_groq_key()
    target_model = (model or _model_name()).removeprefix("groq/")
    t0 = time.perf_counter()
    res = httpx.post(
        GROQ_CHAT_URL,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": target_model,
            "messages": [{"role": "user", "content": "Reply OK"}],
            "max_tokens": 8,
            "temperature": 0,
        },
        timeout=15.0,
    )
    if res.status_code == 401:
        raise LLMKeyInvalidError("Chiave API Groq non valida.")
    if res.status_code == 404:
        raise LLMUpstreamError(f"Modello '{target_model}' non disponibile su Groq.")
    if res.status_code >= 400:
        raise _upstream_error(res)
    latency_ms = round((time.perf_counter() - t0) * 1000)
    return {"ok": True, "model": target_model, "latency_ms": latency_ms}