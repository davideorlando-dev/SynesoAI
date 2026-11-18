from app.core.logging_setup import get_logger
from collections.abc import Callable
from pathlib import Path
import pymupdf
import pymupdf4llm

log = get_logger("app.agents.parser")

_ocr_engine = None


def _get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr import RapidOCR
        _ocr_engine = RapidOCR()
    return _ocr_engine


def _ocr_page_with_rapidocr(pdf_doc: pymupdf.Document, page_idx: int) -> str:
    try:
        engine = _get_ocr_engine()
        pix = pdf_doc[page_idx].get_pixmap(dpi=200)
        res = engine(pix.tobytes("png"))
        txts = getattr(res, "txts", None)
        if txts:
            return "\n".join(str(t) for t in txts if t).strip()
        if isinstance(res, (list, tuple)) and res:
            lines = [
                item[1]
                for item in res
                if isinstance(item, (list, tuple)) and len(item) >= 2
            ]
            return "\n".join(str(t) for t in lines if t).strip()
    except Exception as e:
        log.warning(f"⚠️ Errore RapidOCR su pagina {page_idx + 1}: {e}")
    return ""

def get_pdf_page_count(file_path: Path) -> int:
    with pymupdf.open(str(file_path)) as pdf_doc:
        return len(pdf_doc)

def parse_pdf_pages(
    file_path: Path,
    on_page: Callable[[int, int], None] | None = None,
) -> list[dict]:
    """
    Estrae il testo Markdown pagina per pagina usando PyMuPDF4LLM + RapidOCR sulle scansioni.

    `on_page(numero_pagina, totale)` viene chiamata dopo ogni pagina elaborata:
    serve a riportare l'avanzamento e, sollevando un'eccezione, a interrompere.
    """
    chunks = []
    with pymupdf.open(str(file_path)) as pdf_doc:
        num_pages = len(pdf_doc)
        pages_data = pymupdf4llm.to_markdown(str(file_path), page_chunks=True)

        md_by_idx: dict[int, str] = {}
        if len(pages_data) == num_pages:
            for idx, page in enumerate(pages_data):
                md_by_idx[idx] = (page.get("text") or "").strip()
        else:
            raw_pages = [p.get("metadata", {}).get("page") for p in pages_data]
            is_one_based = (
                any(p == num_pages for p in raw_pages if p is not None)
                and 0 not in raw_pages
            )
            for idx, page in enumerate(pages_data):
                p_meta = page.get("metadata", {}).get("page")
                p_idx = (
                    (p_meta - 1 if is_one_based else p_meta)
                    if p_meta is not None
                    else idx
                )
                md_by_idx[p_idx] = (page.get("text") or "").strip()

        for idx in range(num_pages):
            text = md_by_idx.get(idx, "")
            if len(text) < 40:
                log.info(f"🔎 Eseguo OCR su pagina {idx + 1} di {file_path.name}...")
                ocr_text = _ocr_page_with_rapidocr(pdf_doc, idx)
                if len(ocr_text) > len(text):
                    text = ocr_text

            if text:
                chunks.append({"page_number": idx + 1, "text": text})
            if on_page is not None:
                on_page(idx + 1, num_pages)

    return chunks

def split_page_into_chunks(
    text: str, max_chars: int = 950, overlap: int = 150
) -> list[str]:
    clean = (text or "").strip()
    if not clean:
        return []
    if len(clean) <= max_chars:
        return [clean]

    chunks: list[str] = []
    start = 0
    n = len(clean)
    while start < n:
        end = min(n, start + max_chars)
        if end < n:
            split_at = clean.rfind("\n\n", start + max_chars // 2, end)
            if split_at == -1:
                split_at = clean.rfind("\n", start + max_chars // 2, end)
            if split_at == -1:
                split_at = clean.rfind(". ", start + max_chars // 2, end)
                if split_at != -1:
                    split_at += 1
            if split_at == -1:
                split_at = clean.rfind(" ", start + max_chars // 2, end)
            if split_at != -1 and split_at > start:
                end = split_at

        piece = clean[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= n:
            break
        start = max(start + 1, end - overlap)

    return chunks