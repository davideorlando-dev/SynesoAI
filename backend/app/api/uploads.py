"""Validazione e salvataggio dei file caricati (PDF e immagini convertite in PDF)."""

import os
import re
from pathlib import Path
from typing import Annotated
from uuid import uuid4

import pymupdf
from fastapi import HTTPException, UploadFile
from pydantic import WithJsonSchema

from app.config import settings
from app.services.exam_import import StoredUpload

BinaryUploadFile = Annotated[
    UploadFile, WithJsonSchema({"type": "string", "format": "binary"})
]

ALLOWED_EXTS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB per file
MAX_PDF_PAGES = 1000


def _sanitize_display_name(raw_name: str, default_name: str = "documento.pdf") -> str:
    base = (raw_name or "").replace("\\", "/").split("/")[-1]
    cleaned = re.sub(r"[\x00-\x1f\x7f\"';]+", "", base).strip(" .")
    return cleaned or default_name


def sanitize_disk_stem(name: str) -> str:
    stem = Path(name).stem
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-")
    return cleaned[:60] or "documento"


def _read_upload_limited(upload: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        block = upload.file.read(1024 * 1024)
        if not block:
            break
        total += len(block)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File troppo grande (massimo {max_bytes // (1024 * 1024)} MB).",
            )
        chunks.append(block)
    return b"".join(chunks)


def _restrict_file_permissions(path: Path) -> None:
    if os.name == "posix":
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass


def save_upload_as_pdf(upload: UploadFile, exam_id: str) -> tuple[str, Path]:
    if not upload.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    display_name = _sanitize_display_name(upload.filename)
    ext = Path(display_name).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail="Formati supportati: PDF, PNG, JPG, JPEG",
        )

    uid = uuid4().hex[:6]
    disk_stem = sanitize_disk_stem(display_name)
    dest_path = settings.uploads_dir / f"{exam_id}_{uid}_{disk_stem}.pdf"

    if ext == ".pdf":
        first_chunk = upload.file.read(1024 * 1024)
        if not first_chunk or b"%PDF-" not in first_chunk[:1024]:
            raise HTTPException(
                status_code=400,
                detail=f"Il file '{display_name}' non è un PDF valido.",
            )
        total = len(first_chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File troppo grande (massimo {MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
            )
        try:
            with dest_path.open("wb") as buffer:
                buffer.write(first_chunk)
                while True:
                    block = upload.file.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    if total > MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"File troppo grande (massimo {MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
                        )
                    buffer.write(block)

            with pymupdf.open(str(dest_path)) as pdf_doc:
                if pdf_doc.needs_pass:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Il PDF '{display_name}' è protetto da password.",
                    )
                if len(pdf_doc) == 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Il PDF '{display_name}' non contiene pagine.",
                    )
                if len(pdf_doc) > MAX_PDF_PAGES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Il PDF '{display_name}' supera il limite di {MAX_PDF_PAGES} pagine.",
                    )
        except HTTPException:
            dest_path.unlink(missing_ok=True)
            raise
        except Exception as exc:
            dest_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"Impossibile leggere il PDF '{display_name}': {exc}",
            ) from exc

        _restrict_file_permissions(dest_path)
        return display_name, dest_path

    raw_bytes = _read_upload_limited(upload)
    if ext == ".png" and not raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail=f"Immagine PNG '{display_name}' non valida.")
    if ext in {".jpg", ".jpeg"} and not raw_bytes.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail=f"Immagine JPEG '{display_name}' non valida.")

    try:
        with pymupdf.open(stream=raw_bytes, filetype=ext.lstrip(".")) as img_doc:
            pdf_bytes = img_doc.convert_to_pdf()
        dest_path.write_bytes(pdf_bytes)
        _restrict_file_permissions(dest_path)
    except Exception as exc:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"Impossibile convertire l'immagine '{display_name}': {exc}",
        ) from exc

    return display_name, dest_path


def store_uploads(files: list[BinaryUploadFile], exam_id: str) -> list[StoredUpload]:
    """Valida e salva tutti i file; se uno è rifiutato non ne resta nessuno su disco."""
    stored: list[StoredUpload] = []
    try:
        for upload in files:
            display_name, path = save_upload_as_pdf(upload, exam_id)
            stored.append(StoredUpload(display_name=display_name, path=path))
    except Exception:
        for item in stored:
            item.path.unlink(missing_ok=True)
        raise
    return stored
