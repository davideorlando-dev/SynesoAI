from types import SimpleNamespace
from app.core.citations import ChunkRef, verify_highlights


def test_host_header_blocks_dns_rebinding(client):
    bad = client.get("/health", headers={"Host": "evil.attacker.com"})
    assert bad.status_code == 403

    ok = client.get("/health", headers={"Host": "127.0.0.1:8000"})
    assert ok.status_code == 200


def test_citation_entailment_flags_unsupported_claim():
    doc_meta = [(1, "doc-1", "diritto.pdf", 10)]
    chunks = [
        ChunkRef("doc-1", 4, "La caparra confirmatoria tutela l'adempimento del contratto preliminare tra le parti."),
    ]
    raw = [
        SimpleNamespace(
            doc_index=1,
            page_number=4,
            quote="La caparra confirmatoria tutela l'adempimento del contratto preliminare",
            why_it_matters="La caparra tutela l'adempimento del contratto preliminare",
        ),
        SimpleNamespace(
            doc_index=1,
            page_number=4,
            quote="La caparra confirmatoria tutela l'adempimento del contratto preliminare",
            why_it_matters="Regola l'imposta sul valore aggiunto nelle esportazioni marittime",
        ),
    ]
    out = verify_highlights(raw, doc_meta, chunks)
    assert len(out) == 2
    assert out[0]["verified"] is True and out[0]["supported"] is True
    assert out[1]["verified"] is True and out[1]["supported"] is False
