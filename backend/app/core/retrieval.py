from collections import Counter
import json
import math
import os
import re
import unicodedata
from sqlalchemy import text
from sqlmodel import Session, select
from app.db.models import DocumentChunk

STOPWORDS = {
    # Italiano
    "alla", "alle", "allo", "anche", "avere", "che", "chi", "come", "con", "contro",
    "cosa", "cui", "dagli", "dalla", "dalle", "dallo", "degli", "della", "delle",
    "dello", "dentro", "deve", "devo", "dopo", "dove", "due", "ecco", "entre",
    "era", "erano", "essere", "fanno", "fare", "fatto", "fino", "fra", "gli",
    "hanno", "inoltre", "loro", "lui", "mia", "mie", "miei", "mio", "molto",
    "negli", "nella", "nelle", "nello", "non", "nostra", "nostro", "ogni",
    "oltre", "oppure", "per", "perche", "pero", "piu", "poco", "poi", "prima",
    "proprio", "puo", "qual", "quale", "quali", "quando", "quanto", "quasi",
    "quella", "quelle", "quelli", "quello", "questa", "queste", "questi",
    "questo", "qui", "quindi", "saranno", "sarebbe", "secondo", "senza",
    "sia", "siamo", "siano", "solo", "sono", "sopra", "sotto", "stato", "sua",
    "sue", "sugli", "sulla", "sulle", "sullo", "suo", "suoi", "tanto", "tra",
    "tutta", "tutte", "tutti", "tutto", "una", "uno", "verso", "viene", "vostro",
    # Inglese
    "about", "above", "after", "again", "against", "all", "also", "and", "any",
    "are", "because", "been", "before", "being", "below", "between", "both",
    "but", "can", "could", "did", "does", "doing", "down", "during", "each",
    "few", "for", "from", "further", "had", "has", "have", "having", "her",
    "here", "hers", "herself", "him", "himself", "his", "how", "into", "its",
    "itself", "just", "more", "most", "not", "now", "off", "once", "only",
    "other", "our", "ours", "out", "over", "own", "same", "she", "should",
    "some", "such", "than", "that", "the", "their", "theirs", "them", "then",
    "there", "these", "they", "this", "those", "through", "too", "under",
    "until", "very", "was", "were", "what", "when", "where", "which", "while",
    "who", "whom", "why", "will", "with", "would", "you", "your", "yours",
}

SEMANTIC_MODEL_NAME = "intfloat/multilingual-e5-small"
_embedder = None
_embedder_checked = False


def _get_optional_embedder():
    global _embedder, _embedder_checked
    if _embedder_checked:
        return _embedder
    _embedder_checked = True
    if os.environ.get("SYNESO_DISABLE_FASTEMBED", "").lower() in ("1", "true"):
        return None
    try:
        from fastembed import TextEmbedding

        _embedder = TextEmbedding(model_name=SEMANTIC_MODEL_NAME)
        print(f"🧠 Caricato modello semantico ONNX: {SEMANTIC_MODEL_NAME}")
    except Exception:
        _embedder = None
    return _embedder


def _normalize_for_tokens(raw: str) -> str:
    decomposed = unicodedata.normalize("NFKD", raw or "")
    no_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return no_accents.lower()


def _meaningful_tokens(query: str, max_terms: int = 12) -> list[str]:
    raw_tokens = re.findall(r"[0-9a-z]{3,}", _normalize_for_tokens(query))
    seen: set[str] = set()
    out: list[str] = []
    for tok in raw_tokens:
        if tok in STOPWORDS or tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
        if len(out) >= max_terms:
            break
    if not out:
        for tok in raw_tokens:
            if tok not in seen:
                seen.add(tok)
                out.append(tok)
            if len(out) >= max_terms:
                break
    return out


def _lexical_features(text_val: str) -> Counter:
    tokens = _meaningful_tokens(text_val, max_terms=120)
    feats: Counter = Counter()
    for tok in tokens:
        feats[f"w:{tok}"] += 1.5
        if len(tok) >= 5:
            for i in range(len(tok) - 3):
                feats[f"g:{tok[i:i+4]}"] += 0.5
    return feats


def _cosine_dense(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def index_exam_chunks(session: Session, exam_id: str, chunks: list[DocumentChunk]) -> None:
    if not chunks:
        return
    rows = [
        {
            "chunk_id": c.id,
            "exam_id": exam_id,
            "document_id": c.document_id,
            "page_number": c.page_number,
            "text": c.text,
        }
        for c in chunks
    ]
    session.execute(
        text(
            """
            INSERT INTO documentchunk_fts (chunk_id, exam_id, document_id, page_number, text)
            VALUES (:chunk_id, :exam_id, :document_id, :page_number, :text)
            """
        ),
        rows,
    )

    embedder = _get_optional_embedder()
    if embedder is not None:
        try:
            passages = [f"passage: {c.text[:1200]}" for c in chunks]
            vectors = list(embedder.embed(passages))
            vec_rows = [
                {
                    "chunk_id": c.id,
                    "exam_id": exam_id,
                    "model": SEMANTIC_MODEL_NAME,
                    "vector_json": json.dumps([round(float(x), 5) for x in vec]),
                }
                for c, vec in zip(chunks, vectors, strict=True)
            ]
            session.execute(
                text(
                    """
                    INSERT OR REPLACE INTO documentchunk_vec (chunk_id, exam_id, model, vector_json)
                    VALUES (:chunk_id, :exam_id, :model, :vector_json)
                    """
                ),
                vec_rows,
            )
        except Exception as exc:
            print(f"⚠️ Indicizzazione vettoriale saltata: {exc}")


def delete_exam_fts(session: Session, exam_id: str) -> None:
    session.execute(
        text("DELETE FROM documentchunk_fts WHERE exam_id = :exam_id"),
        {"exam_id": exam_id},
    )
    try:
        session.execute(
            text("DELETE FROM documentchunk_vec WHERE exam_id = :exam_id"),
            {"exam_id": exam_id},
        )
    except Exception:
        pass


def _fts5_rank(
    session: Session, exam_id: str, query: str, limit: int
) -> list[str]:
    tokens = _meaningful_tokens(query, max_terms=12)
    if not tokens:
        return []

    clauses: list[str] = []
    for tok in tokens:
        clauses.append(f'"{tok}"')
        if len(tok) >= 6:
            clauses.append(f'"{tok[:-2]}"*')

    fts_query = " OR ".join(clauses)
    try:
        rows = session.execute(
            text(
                """
                SELECT chunk_id
                FROM documentchunk_fts
                WHERE documentchunk_fts MATCH :q AND exam_id = :exam_id
                ORDER BY bm25(documentchunk_fts)
                LIMIT :limit
                """
            ),
            {"q": fts_query, "exam_id": exam_id, "limit": limit},
        ).all()
        return [r[0] for r in rows]
    except Exception:
        return []


def _semantic_rank(
    session: Session, exam_id: str, query: str, limit: int
) -> list[str]:
    embedder = _get_optional_embedder()
    if embedder is not None:
        try:
            vec_rows = session.execute(
                text(
                    "SELECT chunk_id, vector_json FROM documentchunk_vec WHERE exam_id = :exam_id"
                ),
                {"exam_id": exam_id},
            ).all()
            if vec_rows:
                q_vec = [float(x) for x in next(embedder.embed([f"query: {query[:500]}"]))]
                scored_dense = []
                for cid, vjson in vec_rows:
                    sim = _cosine_dense(q_vec, json.loads(vjson))
                    if sim > 0.25:
                        scored_dense.append((sim, cid))
                scored_dense.sort(reverse=True)
                return [cid for _, cid in scored_dense[:limit]]
        except Exception:
            pass

    # Fallback semantico locale (zero dipendenze): TF-IDF su token + n-grammi di caratteri
    rows = session.execute(
        text(
            """
            SELECT dc.id, dc.text
            FROM documentchunk dc
            JOIN document d ON d.id = dc.document_id
            WHERE d.exam_id = :exam_id
            """
        ),
        {"exam_id": exam_id},
    ).all()
    if not rows:
        return []

    q_feats = _lexical_features(query)
    if not q_feats:
        return []

    doc_feats = [(cid, _lexical_features(txt)) for cid, txt in rows]
    n_docs = len(doc_feats)
    df: Counter = Counter()
    for _, feats in doc_feats:
        for k in feats.keys():
            if k in q_feats:
                df[k] += 1

    if not df:
        return []

    idf = {k: math.log((n_docs + 1) / (freq + 1)) + 1.0 for k, freq in df.items()}
    q_weights = {k: v * idf.get(k, 1.0) for k, v in q_feats.items()}
    q_norm = math.sqrt(sum(w * w for w in q_weights.values()))
    if q_norm == 0.0:
        return []

    scored: list[tuple[float, str]] = []
    for cid, feats in doc_feats:
        dot = sum(q_weights[k] * (feats[k] * idf[k]) for k in df if k in feats)
        if dot <= 0.0:
            continue
        d_norm = math.sqrt(sum((v * idf.get(k, 1.0)) ** 2 for k, v in feats.items()))
        if d_norm > 0.0:
            sim = dot / (q_norm * d_norm)
            if sim >= 0.05:
                scored.append((sim, cid))

    scored.sort(reverse=True)
    return [cid for _, cid in scored[:limit]]


def search_exam_chunks(
    session: Session, exam_id: str, query: str, limit: int = 6
) -> list[DocumentChunk]:
    pool = max(limit * 3, 12)
    fts_ids = _fts5_rank(session, exam_id, query, limit=pool)
    sem_ids = _semantic_rank(session, exam_id, query, limit=pool)

    rrf_scores: dict[str, float] = {}
    for rank, cid in enumerate(fts_ids):
        rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (60 + rank)
    for rank, cid in enumerate(sem_ids):
        rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (60 + rank)

    if not rrf_scores:
        return []

    ranked_ids = [
        cid for cid, _ in sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
    ][:limit]

    chunks = session.exec(
        select(DocumentChunk).where(DocumentChunk.id.in_(ranked_ids))
    ).all()
    by_id = {c.id: c for c in chunks}
    return [by_id[cid] for cid in ranked_ids if cid in by_id]