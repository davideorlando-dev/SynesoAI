# Third-party software

Syneso bundles the libraries below into the application it ships. This file
records what sets Syneso's own licence and how to produce an authoritative,
machine-generated report of every transitive dependency.

## The dependency that decides Syneso's licence

[PyMuPDF](https://github.com/pymupdf/PyMuPDF) and
[pymupdf4llm](https://github.com/pymupdf/RAG) are published by Artifex under
**AGPL-3.0 or a commercial licence**. Syneso ships them inside the application
— they read the PDFs, render pages for OCR and convert images — so the
combined work is distributed under the AGPL as well. That is why Syneso is
AGPL-3.0-or-later and not something more permissive.

Anyone who wants to distribute Syneso, or a derivative of it, **without** the
AGPL's obligations has exactly two options: buy a commercial PyMuPDF licence
from Artifex, or replace PyMuPDF with a permissively licensed PDF stack and
accept the loss in extraction quality.

## Bundled at runtime

Backend (Python): `fastapi`, `uvicorn[standard]`, `sqlmodel`,
`pydantic-settings`, `python-multipart`, `httpx`, `pymupdf`, `pymupdf4llm`,
`ddgs`, `fsrs`, `rapidocr`, `onnxruntime`, `pywebview`.

Frontend (npm): `next`, `react`, `react-dom`, `react-markdown`, `remark-gfm`,
`remark-math`, `rehype-katex`, `katex`, `lucide-react`, `tailwindcss`.

Each package carries its own licence in its own metadata, which is the only
authoritative source — a list copied by hand into a file like this one goes
stale the first time a dependency is updated.

## Build-only

`pyinstaller` builds the executable. It is GPL-2.0-or-later **with an
exception** that allows the bundled application to carry any licence, so it
places no obligation on Syneso or on what Syneso bundles. It is not shipped
inside the application.

`pytest`, `@playwright/test`, `eslint`, `typescript` and the type packages are
development tools and are not distributed.

## Producing the full report

Run these in a checkout with dependencies installed. Both read the installed
packages' own metadata, so their output is current by construction.

```bash
# Python, from backend/
uv run --with pip-licenses pip-licenses --format=markdown \
  --with-urls --with-license-file --output-file ../third-party-python.md

# npm, from frontend/
npx --yes license-checker --production --markdown > ../third-party-npm.md
```

Attach both to a release when the dependency set changes.
