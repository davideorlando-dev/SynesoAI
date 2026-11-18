import re
import unicodedata
from dataclasses import dataclass
from app.db.models import Document, DocumentChunk


@dataclass
class ChunkRef:
    document_id: str
    page_number: int
    text: str


def _normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value or "")
    no_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = re.sub(r"[^\w\s]", " ", no_accents.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _content_tokens(norm_text: str) -> list[str]:
    return [w for w in norm_text.split() if len(w) >= 3]


def _quote_match_score(quote: str, page_text: str) -> float:
    nq = _normalize_text(quote)
    np = _normalize_text(page_text)
    if not nq or not np:
        return 0.0
    if len(nq) >= 12 and nq in np:
        return 1.0

    q_tokens = _content_tokens(nq)
    if not q_tokens:
        return 1.0 if nq in np else 0.0
    p_token_set = set(_content_tokens(np))
    if not p_token_set:
        return 0.0

    hits = sum(1 for tok in q_tokens if tok in p_token_set)
    return hits / len(q_tokens)



def _entailment_score(claim: str, page_text: str) -> float:
    nc = _normalize_text(claim)
    np = _normalize_text(page_text)
    if not nc or not np:
        return 0.0
    c_tokens = _content_tokens(nc)
    if not c_tokens:
        return 0.0
    p_tokens = set(_content_tokens(np))
    exact_hits = sum(1 for tok in c_tokens if tok in p_tokens)
    stem_hits = sum(
        1 for tok in c_tokens
        if tok in p_tokens or (len(tok) >= 5 and any(pt.startswith(tok[:5]) for pt in p_tokens))
    )
    return min(1.0, (0.6 * exact_hits + 0.4 * stem_hits) / len(c_tokens))

def resolve_doc_page(
    doc_index: int,
    page_number: int | None,
    doc_by_index: dict[int, tuple[str, str, int]],
) -> tuple[str | None, str | None, int | None]:
    """
    doc_by_index: {1-based_idx: (doc_id, filename, page_count)}
    Restituisce (doc_id, filename, page_number) solo se validi, altrimenti (None, None, None).
    """
    if page_number is None:
        return None, None, None
    doc_info = doc_by_index.get(doc_index)
    if not doc_info:
        return None, None, None
    doc_id, filename, page_count = doc_info
    if page_number < 1 or (page_count > 0 and page_number > page_count):
        return None, None, None
    return doc_id, filename, int(page_number)


def verify_highlights(
    raw_highlights: list,
    doc_meta: list[tuple[int, str, str, int]],
    allowed_chunks: list[ChunkRef],
) -> list[dict]:
    """
    Verifica ogni highlight contro i chunk effettivamente forniti all'LLM:
    - conferma match esatto/fuzzy della citazione sulla pagina dichiarata;
    - autoripara doc_id/page_number se la citazione appartiene chiaramente a un altro chunk nel contesto;
    - scarta citazioni con indice documento o pagina inesistenti.
    """
    doc_by_index = {idx: (did, fname, pcount) for idx, did, fname, pcount in doc_meta}
    meta_by_doc_id = {did: (fname, pcount) for _, did, fname, pcount in doc_meta}

    chunk_map: dict[tuple[str, int], str] = {}
    for ch in allowed_chunks:
        key = (ch.document_id, ch.page_number)
        chunk_map[key] = f"{chunk_map.get(key, '')}\n{ch.text}".strip()

    verified_list: list[dict] = []
    seen: set[tuple[str, int, str]] = set()

    for h in raw_highlights:
        quote = (getattr(h, "quote", "") or "").strip()
        why = (getattr(h, "why_it_matters", "") or "").strip()
        if not quote:
            continue

        doc_id, filename, page_num = resolve_doc_page(
            getattr(h, "doc_index", 0),
            getattr(h, "page_number", None),
            doc_by_index,
        )

        verified = False
        if doc_id and page_num and (doc_id, page_num) in chunk_map:
            if _quote_match_score(quote, chunk_map[(doc_id, page_num)]) >= 0.55:
                verified = True

        if not verified and allowed_chunks:
            best_score = 0.0
            best_key: tuple[str, int] | None = None
            for key, page_text in chunk_map.items():
                score = _quote_match_score(quote, page_text)
                if score > best_score:
                    best_score = score
                    best_key = key

            if best_key is not None and best_score >= 0.72:
                doc_id, page_num = best_key
                filename = meta_by_doc_id.get(doc_id, (None, 0))[0]
                verified = True

        if not doc_id or not page_num:
            continue

        if not verified and (doc_id, page_num) not in chunk_map:
            continue

        normalized_why = " ".join(str(why or "").casefold().split())
        dedup_key = (
            doc_id,
            page_num,
            quote.strip().casefold(),
            normalized_why,
        )       
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        chunk_txt = chunk_map.get((doc_id, page_num), "")
        entail = _entailment_score(why, chunk_txt) if why and chunk_txt else 0.0
        verified_list.append(
            {
                "doc_id": doc_id,
                "filename": filename,
                "page_number": page_num,
                "quote": quote,
                "why_it_matters": why,
                "verified": verified,
                "supported": bool(verified and (not why or entail >= 0.25)),
                "entailment_score": round(entail, 2),
            }
        )

    return verified_list


def filter_valid_page_refs(
    refs: list,
    docs: list[Document],
    chunks: list[DocumentChunk],
) -> list[dict]:
    doc_by_index = {idx + 1: d for idx, d in enumerate(docs)}
    max_page_by_doc: dict[str, int] = {}
    for d in docs:
        max_chunk_page = max(
            (c.page_number for c in chunks if c.document_id == d.id), default=0
        )
        max_page_by_doc[d.id] = d.page_count if d.page_count > 0 else max_chunk_page

    out: list[dict] = []
    seen: set[tuple[str, int]] = set()
    for ref in refs:
        doc = doc_by_index.get(ref.doc_index)
        if not doc:
            continue
        max_p = max_page_by_doc.get(doc.id, 0)
        if ref.page < 1 or (max_p > 0 and ref.page > max_p):
            continue
        pair = (doc.id, int(ref.page))
        if pair in seen:
            continue
        seen.add(pair)
        out.append({"doc_id": doc.id, "page": int(ref.page)})
    return out