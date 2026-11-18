from types import SimpleNamespace
from sqlmodel import Session

from app.core.citations import ChunkRef, filter_valid_page_refs, verify_highlights
from app.core.retrieval import index_exam_chunks, search_exam_chunks
from app.db.models import Document, DocumentChunk, Exam


def test_verify_highlights_confirms_repairs_and_drops_hallucinations():
    doc_meta = [(1, "doc-1", "dispensa.pdf", 10)]
    chunks = [
        ChunkRef("doc-1", 3, "Il principio di buona fede impone alle parti correttezza nelle trattative."),
        ChunkRef("doc-1", 7, "La nullita del contratto puo essere rilevata d ufficio dal giudice."),
    ]
    raw = [
        SimpleNamespace(doc_index=1, page_number=3, quote="buona fede impone alle parti correttezza", why_it_matters="Regola base"),
        SimpleNamespace(doc_index=1, page_number=2, quote="nullità del contratto può essere rilevata d'ufficio dal giudice", why_it_matters="Pagina sbagliata dall'LLM"),
        SimpleNamespace(doc_index=1, page_number=99, quote="citazione inesistente su pagina fuori range", why_it_matters="Allucinazione"),
    ]

    verified = verify_highlights(raw, doc_meta, chunks)
    assert len(verified) == 2
    assert verified[0]["page_number"] == 3 and verified[0]["verified"] is True
    assert verified[1]["page_number"] == 7 and verified[1]["verified"] is True


def test_filter_valid_page_refs_rejects_out_of_bounds():
    d1 = Document(id="d1", exam_id="e1", filename="a.pdf", file_path="a.pdf", page_count=5)
    refs = [
        SimpleNamespace(doc_index=1, page=0),
        SimpleNamespace(doc_index=1, page=3),
        SimpleNamespace(doc_index=1, page=6),
        SimpleNamespace(doc_index=9, page=1),
    ]
    out = filter_valid_page_refs(refs, [d1], [])
    assert out == [{"doc_id": "d1", "page": 3}]


def test_hybrid_retrieval_finds_relevant_italian_chunk(isolated_env):
    with Session(isolated_env["engine"]) as s:
        ex = Exam(title="Economia")
        s.add(ex)
        s.flush()
        doc = Document(exam_id=ex.id, filename="micro.pdf", file_path="micro.pdf", page_count=3)
        s.add(doc)
        s.flush()
        c1 = DocumentChunk(document_id=doc.id, page_number=1, chunk_index=0, text="L'elasticita incrociata della domanda misura la variazione rispetto al prezzo di un altro bene.")
        c2 = DocumentChunk(document_id=doc.id, page_number=2, chunk_index=1, text="Il costo marginale rappresenta la derivata del costo totale rispetto alla quantita prodotta.")
        s.add(c1)
        s.add(c2)
        s.flush()
        index_exam_chunks(s, ex.id, [c1, c2])
        s.commit()

        hits = search_exam_chunks(s, ex.id, "elasticita domanda prezzo altro bene", limit=2)
        assert len(hits) >= 1
        assert hits[0].id == c1.id
