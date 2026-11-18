from sqlmodel import Session, create_engine
from sqlalchemy import event
import app.db.database as db_mod
from app.core.retrieval import index_exam_chunks, search_exam_chunks
from app.db.models import Document, DocumentChunk, Exam
from sqlmodel import SQLModel


BENCHMARK_PAGES = [
    (1, "Il bilancio d'esercizio si compone di stato patrimoniale, conto economico e nota integrativa secondo il codice civile."),
    (2, "L'ammortamento ripartisce il costo di un'immobilizzazione materiale lungo la sua vita utile residua."),
    (3, "La responsabilità precontrattuale deriva dalla violazione della buona fede durante le trattative (art. 1337 c.c.)."),
    (4, "Il metodo Feynman consiste nello spiegare un concetto complesso con parole semplici per individuare le lacune."),
    (5, "L'algoritmo FSRS stima la stabilità della memoria e la probabilità di richiamo prima della scadenza."),
]

QUERIES = [
    ("da cosa e composto il bilancio civilistico", 1),
    ("ripartizione costo immobilizzazioni vita utile", 2),
    ("buona fede nelle trattative articolo 1337", 3),
    ("spiegare concetti semplici per trovare lacune", 4),
    ("stabilita memoria algoritmo spaced repetition", 5),
]


def run_benchmark(k: int = 3) -> None:
    eng = create_engine("sqlite:///:memory:")
    @event.listens_for(eng, "connect")
    def _on_c(c, _):
        db_mod._configure_sqlite_connection(c, _)
    SQLModel.metadata.create_all(eng)
    with eng.begin() as conn:
        db_mod._migration_v1(conn)
        db_mod._migration_v2(conn)

    with Session(eng) as s:
        ex = Exam(title="Benchmark")
        s.add(ex)
        s.flush()
        doc = Document(exam_id=ex.id, filename="bench.pdf", file_path="bench.pdf", page_count=5)
        s.add(doc)
        s.flush()
        chunks = [DocumentChunk(document_id=doc.id, page_number=p, chunk_index=p - 1, text=txt) for p, txt in BENCHMARK_PAGES]
        for ch in chunks:
            s.add(ch)
        s.flush()
        index_exam_chunks(s, ex.id, chunks)
        s.commit()

        hits_at_k = 0
        mrr_sum = 0.0
        for q, expected_page in QUERIES:
            res = search_exam_chunks(s, ex.id, q, limit=k)
            pages = [r.page_number for r in res]
            if expected_page in pages:
                hits_at_k += 1
                mrr_sum += 1.0 / (pages.index(expected_page) + 1)
            print(f"Q: '{q}' -> got pages {pages} (expected {expected_page})")

        print(f"\n📊 Recall@{k}: {hits_at_k}/{len(QUERIES)} ({100*hits_at_k/len(QUERIES):.0f}%) | MRR@{k}: {mrr_sum/len(QUERIES):.2f}")


if __name__ == "__main__":
    run_benchmark(3)
