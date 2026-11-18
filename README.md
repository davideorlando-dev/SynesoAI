<p align="left">
  <img src="frontend/public/syneso-icon.svg" width="56" alt="Syneso Logo" />
</p>

# Syneso

**Connect to understand. Explain to master.**

[![Licence: AGPL v3](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/davideorlando-dev/SynesoAI?display_name=tag&sort=semver)](https://github.com/davideorlando-dev/SynesoAI/releases)
[![CI](https://github.com/davideorlando-dev/SynesoAI/actions/workflows/ci.yml/badge.svg)](https://github.com/davideorlando-dev/SynesoAI/actions/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows-lightgrey)](https://github.com/davideorlando-dev/SynesoAI/releases)

**Just want to use it?** Download the installer from [Releases](https://github.com/davideorlando-dev/SynesoAI/releases) and follow the [installation guide](docs/installazione.md) (in Italian, the language of most of its users). The rest of this file is for reading and building the code.

| | |
|---|---|
| **What changed** | [CHANGELOG.md](CHANGELOG.md) |
| **How it looks, and why** | [DESIGN.md](DESIGN.md) |
| **How to contribute** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Reporting a vulnerability** | [SECURITY.md](SECURITY.md) |
| **Third-party licences** | [THIRD-PARTY.md](THIRD-PARTY.md) |

---

Syneso is a local-first, AI-assisted learning platform designed to help students move beyond passive rereading through structured study material, active recall, conceptual explanation, and exam simulation.

The application combines a static Next.js frontend with a local FastAPI backend. Documents, OCR processing, the database, backups, and spaced-repetition state remain on the user's device. Selected study context, prompts, answers, and optional voice recordings are sent to Groq when cloud inference or transcription is requested. **Syneso is local-first, not fully offline.**

---

## 1. Philosophy & Name Origin (*Sýnesis*)

The name **Syneso** takes inspiration from the Ancient Greek **σύνεσις** (*sýnesis*): understanding that comes from bringing ideas together and recognizing how they relate.

That principle shapes the product's learning loop:

- **Σύν · Connect:** Turn PDFs, scanned material, and notes into an organized curriculum with topic relationships and references to source pages.
- **Λόγος · Explain:** Check actual understanding through the **Feynman Technique**, using written or optional spoken explanations evaluated against a weighted rubric.
- **Μνήμη · Consolidate:** Strengthen retention with **FSRS v6** spaced repetition, adapted to the exam date, and verify preparation through timed mock exams graded out of 30.

---

## 2. Key Features

### Document ingestion & source-grounded curriculum

- **Multi-format import:** Import digital PDFs, scanned PDFs, and note images (`PNG` / `JPG`). Images are converted to PDF and processed page by page.
- **Local text extraction and OCR:** Text extraction uses `pymupdf4llm`; pages with insufficient extracted text can fall back to local **RapidOCR** through ONNX Runtime.
- **Smart chunking:** Extracted text is split into overlapping chunks (`950` characters with `150` characters of overlap) for retrieval and grounding. PDF table-of-contents information is used when available; pages with fewer than `40` extracted characters can fall back to local OCR.
- **Customizable topic map:** Guide topic extraction with syllabus instructions, professor focus, and exclusions. Add or edit topics, set priority (`CORE`, `IMPORTANT`, `DETAIL`), and skip or restore topics.
- **Adaptive study roadmap:** Build a prerequisite-aware daily plan using topic dependencies, preserve a final-review buffer, and replan from the current day when priorities or availability change.

### Notes, citations & active study

- **Streaming study notes:** Generate structured Markdown notes through Server-Sent Events (SSE), with tables and mathematical notation, then edit them in the workspace.
- **Citation verification and repair:** Check generated quotations against the retrieved document chunks. A matching quotation can be associated with the correct source page when the model returns an incorrect page reference; invalid references are discarded.
- **Claim support indicator:** In addition to checking whether a quotation appears in the source, Syneso calculates a lightweight lexical support score for `why_it_matters` against the corresponding page text. The resulting `supported` flag is a heuristic indicator, not a guarantee of semantic correctness.
- **PDF-linked study:** Open the referenced document and page directly from a citation. Highlight a passage to request a simpler explanation or create a flashcard.
- **Study Partner:** Ask questions in the context of the current topic and its retrieved source material.
- **Safe streaming updates:** If a notes-generation stream is interrupted, the existing notes and flashcards are preserved instead of being replaced by a partial result.

### Understanding & retention

- **Feynman evaluation:** A multi-turn, Socratic assessment evaluates an explanation across 4–6 weighted criteria. Each criterion is marked `COVERED`, `PARTIAL`, or `MISSING`; core missing concepts can block a pass even when the numeric score is high.
- **Written and spoken answers:** Write explanations or use optional voice recording and transcription. Drafts are saved locally, and missing concepts can be turned into targeted flashcards.
- **FSRS v6 scheduling:** Flashcards use the `fsrs` scheduler with a target retention of `0.90`, tightened to `0.92` within seven days of the exam. Scheduling applies a local-time cutoff at 20:00 on the evening before the exam and exposes review previews and retrievability estimates.
- **Study analytics:** Review recent study activity, card load, retention estimates, and an indicative exam-grade forecast.

### Exam simulation & workspace

- **Configurable mock exams:** Generate simulations with different question counts and focus modes, including all topics, core topics, or weaker topics. A visible timer and written or spoken answers support exam practice.
- **Deterministic score calculation:** The model evaluates each expected answer point as `COVERED`, `PARTIAL`, or `MISSING`. Python applies the corresponding weights (`1`, `0.5`, `0`) using the points allocated to each question, normalizes the final result to `/30`, and determines passing at `18/30`. The model does not freely choose the final numeric grade.
- **Targeted feedback:** Each simulation includes strengths, missing concepts, a model answer, persistent history, and flashcards for gaps identified during grading.
- **Unified workspace:** A persistent application shell connects the active exam, topic navigation, study tools, and settings.
- **Global search & archive:** Use `⌘K` search across topics, notes, flashcards, and PDFs, plus the global archive for documents, notes, and mock-exam history.
- **Focus and export tools:** Focus Mode (`Z`), Markdown (`.md`) export, Anki-compatible text (`.txt`) export, and calendar (`.ics`) export support different study workflows.
- **Bilingual interface:** The user interface and backend messages support Italian and English (`IT | EN`).

### Orientation, surface & resilience

- **Home as a timeline:** The home screen is a single line — recorded activity behind, planned study days ahead, the exam at the end — with one large countdown above it.
- **Coverage projection:** A pure function (`core/projection.py`) compares the estimated minutes of unfinished topics with the declared daily hours and the days remaining, then states how many topics fit, which one falls out first, and how many extra minutes a day would cover them all. With no exam date, no projection is shown.
- **Prerequisite map:** Topics are drawn as a graph of their real dependencies, laid out left to right by longest prerequisite chain. Every node opens its topic.
- **Light and dark themes:** System, light, or dark, remembered per device. The dark theme is the same palette inverted — ink and canvas swap — and is applied before first paint, so there is no white flash at startup.
- **Keyboard support:** A visible gold focus ring on every focusable element, and dialogs that trap focus while open and return it on close.
- **Failure pages:** Render errors, unknown routes, and layout-level crashes each get a page that states, first, that the local data is untouched.

---

## 3. System Architecture

Syneso is organized as a local desktop/web application with three main parts: a static frontend, a local API and orchestration layer, and local persistence. Groq is an external inference service rather than the application's database or document store.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                    Frontend · Next.js 16 / React 19                      │
│                                                                          │
│  Static Export · Tailwind CSS v4 · TypeScript · Markdown / KaTeX         │
│  App Shell · Home · Study Workspace · PDF Viewer · Archive · IT / EN    │
│  Feature Views · Reusable Hooks                                          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ HTTP / JSON · SSE streams
┌────────────────────────────────────▼─────────────────────────────────────┐
│                      Local Backend · FastAPI                             │
│                                                                          │
│  API Routers: exams · study · settings · health                          │
│  Host / Origin Guard · CORS · Security Response Headers                  │
│                                                                          │
│  Agents                         Core Services                            │
│  ├─ parser                      ├─ LLM client / retries                  │
│  ├─ mapper                      ├─ hybrid retrieval                      │
│  ├─ synthesizer                 ├─ citation verification                 │
│  ├─ Feynman evaluator           ├─ study planner                         │
│  └─ mock exam generator/grader  └─ FSRS scheduler                        │
└─────────────────┬───────────────────────────────────┬────────────────────┘
                  │ Local data & processing           │ Selected inference data
┌─────────────────▼─────────────────┐       ┌──────────▼───────────────────┐
│           Local machine           │       │          Groq API            │
│                                   │       │                              │
│  SQLite · WAL · FTS5              │       │  LLM structured responses    │
│  Documents & extracted chunks     │       │  Notes / explanation / grade │
│  Local RapidOCR / ONNX Runtime    │       │  Optional Whisper STT       │
│  FSRS state & study history       │       │                              │
│  Backups · uploaded documents     │       └──────────────────────────────┘
└───────────────────────────────────┘
```

### Frontend architecture

The frontend is a **Next.js static export** served by the local FastAPI application. The study workspace has been split into dedicated feature views so that `exam/page.tsx` can coordinate the page and its data while focused components own the presentation of individual study areas.

- `components/exam/AnalyticsView.tsx` — study analytics view.
- `components/exam/FeynmanView.tsx` — Feynman explanation and evaluation view.
- `components/exam/FlashcardsView.tsx` — flashcard and review view.
- `components/exam/MockExamView.tsx` — mock-exam interface.
- `hooks/useVoiceRecorder.ts` — reusable voice-recording logic.

Shared application components such as `AppShell`, search, language controls, and the Syneso mark remain in `components/`.

### Backend architecture

The backend is a modular FastAPI application. API routers handle HTTP and streaming contracts; agents implement study workflows; core modules provide cross-cutting services; and the database layer manages persistence.

- **API layer (`api/`):** Exam/document lifecycle, topic study workflows, notes, flashcards, and settings endpoints.
- **Agents (`agents/`):** Document parser, topic mapper, notes synthesizer, Feynman evaluator, and mock-exam generation/grading.
- **Core (`core/`):** LLM integration, citation checks, hybrid retrieval, study planning, and FSRS scheduling.
- **Persistence (`db/`):** SQLModel entities and SQLite initialization, migrations, and backups.
- **Tools (`tools/`):** Optional web-search integration used by the study workflow when enabled.

### Key architectural choices

- **Hybrid retrieval (`core/retrieval.py`):** Combines SQLite FTS5 / BM25 ranking with semantic ranking. When available, `fastembed` uses `intfloat/multilingual-e5-small` embeddings through ONNX Runtime; otherwise, a dependency-light TF-IDF and character 4-gram cosine fallback can be used. Ranked results are fused with Reciprocal Rank Fusion (RRF).
- **Citation verification (`core/citations.py`):** Quote matching first checks the declared document page (`0.55` token-match threshold), then searches the allowed context chunks and can repair the document/page reference when a stronger match is found (`0.72` threshold). The `supported` flag separately estimates whether the explanation attached to the quote is textually supported by the source (lexical support threshold `0.25`). Distinct `why_it_matters` claims are retained even when they use the same quotation.
- **Deterministic mock grading (`agents/mock_exam.py`):** The LLM labels each expected point; Python calculates question scores and the final `/30` result from those labels and the preassigned question maxima. This keeps the numeric scoring rule in application code.
- **Resilient SQLite (`db/database.py`):** SQLite uses WAL mode, `synchronous=NORMAL`, foreign-key enforcement, and a `5000 ms` busy timeout. Idempotent, versioned migrations run with automatic pre-migration and daily backups (the latest five are retained); a manual backup is also available from settings.
- **Desktop packaging (`launcher.py`):** The frontend is exported to static files and served by FastAPI inside a native `pywebview` window. The launcher also supports a browser fallback and a single-instance check.

---

## 4. Data Handling, Security & Privacy

### What stays local and what is sent to Groq

**Stored and processed locally:**
- Original PDFs and imported note images.
- PDF parsing, text extraction, and RapidOCR processing.
- SQLite database, extracted chunks, flashcards, FSRS state, study history, and backups.
- Local application configuration and the user's API key.

**Sent to Groq when the relevant AI feature is used:**
- The selected/retrieved text excerpts needed for topic mapping, notes, explanations, or grading.
- The user's written Feynman or mock-exam answers when they are submitted for AI evaluation.
- Optional voice recordings for Whisper transcription; the resulting transcript may then be used in the relevant study workflow.

Syneso therefore keeps the source library and persistent study data on the device, but cloud AI features require selected content to leave the device for inference. Avoid describing the application as fully offline.

### Security controls

- **Local Host and Origin guard (`main.py`):** Rejects requests with non-local `Host` headers and blocks mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) when their `Origin` is not a permitted localhost origin. The Host check is an additional mitigation against DNS-rebinding-style access.
- **CORS and response headers:** CORS is restricted to local frontend origins. Responses include `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, and a Content Security Policy for permitted frame ancestors.
- **Upload validation (`api/exams.py`):** Checks file extensions and file signatures, rejects empty or encrypted PDFs, enforces a **50 MB per-file** limit and a **1,000-page** limit, and sanitizes filenames.
- **Path traversal protection:** Resolved paths are checked against the uploads directory before files are served or deleted. PDF responses use private, no-store caching.
- **Secrets and filesystem permissions:** API keys are masked in settings responses and validated before persistence. On POSIX systems, data/upload directories use restrictive permissions (`0700`) and `.env` / uploaded files use `0600` where supported.
- **LLM resilience (`core/llm.py`):** Transient API failures and rate limits use retry/backoff handling; structured responses are validated against Pydantic schemas, with recovery paths for truncated output.

---

## 5. AI Models & Inference Strategy

Syneso calls the **Groq API** from `backend/app/core/llm.py` using structured Pydantic outputs and streaming responses where appropriate.

| Capability | Model | Usage |
| :--- | :--- | :--- |
| **Default reasoning & synthesis** | `openai/gpt-oss-120b` | Topic mapping, notes, Feynman evaluation, and mock-exam grading |
| **Fast alternative** | `openai/gpt-oss-20b` | Selectable lower-latency option in Settings |
| **Italian / multilingual alternative** | `qwen/qwen3.8-27b` | Selectable model option in Settings |
| **Speech-to-text** | `whisper-large-v3-turbo` | Optional transcription of spoken study answers |
| **Local OCR** | `RapidOCR` + `ONNX Runtime` | OCR fallback for pages with insufficient extracted text |

The available LLM choices are configurable in Settings. OCR is local; Whisper transcription is a cloud operation.

### Adaptive reasoning effort

The LLM client assigns different reasoning effort according to the task. Routine generation and retrieval-oriented tasks use a faster setting, while rubric evaluation and mock-exam grading use a deeper setting. Python remains responsible for deterministic mock-exam score calculation after the model has classified the expected points.

---

## 6. Project Structure

```text
syneso/
├── .github/
│   └── workflows/
│       └── build-windows.yml        # Frontend build, backend tests & Windows packaging
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── parser.py            # PDF/image ingestion, extraction and chunking
│   │   │   ├── mapper.py            # Topic extraction and curriculum mapping
│   │   │   ├── synthesizer.py       # Notes, highlights, cards and study context
│   │   │   ├── feynman.py           # Weighted Feynman evaluation
│   │   │   └── mock_exam.py         # Mock-exam generation and deterministic scoring
│   │   ├── api/
│   │   │   ├── exams.py             # Exam and document endpoints
│   │   │   └── study.py             # Topic, notes, flashcard and study endpoints
│   │   ├── core/
│   │   │   ├── llm.py               # Groq client, structured output and retries
│   │   │   ├── citations.py         # Quote verification, page repair and claim support
│   │   │   ├── retrieval.py         # FTS5 + semantic/fallback retrieval and RRF
│   │   │   ├── planner.py           # Prerequisite-aware study planning
│   │   │   ├── projection.py        # How much of the syllabus fits in the time left
│   │   │   └── fsrs_engine.py       # FSRS scheduling and retention analytics
│   │   ├── db/
│   │   │   ├── database.py          # SQLite setup, migrations and backups
│   │   │   └── models.py            # SQLModel database entities
│   │   ├── tools/
│   │   │   └── web_search.py        # Optional web-search integration
│   │   ├── config.py                # Settings, paths and filesystem permissions
│   │   └── main.py                  # FastAPI app, security middleware and static mount
│   ├── tests/
│   │   ├── conftest.py              # Isolated test fixtures
│   │   ├── test_citations_and_retrieval.py
│   │   ├── test_database_and_migrations.py
│   │   ├── test_entailment_and_host_guard.py
│   │   ├── test_fsrs_and_feynman.py
│   │   ├── test_mock_exam_and_stream.py
│   │   ├── test_security_and_uploads.py
│   │   └── benchmark_retrieval.py   # Small retrieval smoke benchmark
│   ├── launcher.py                  # Native desktop launcher (uvicorn + pywebview)
│   ├── pyproject.toml               # Python dependencies and pytest configuration
│   └── uv.lock
├── frontend/
│   ├── public/                      # Icons and static assets
│   └── src/
│       ├── app/
│       │   ├── page.tsx             # Onboarding and home dashboard
│       │   ├── exam/page.tsx        # Study workspace orchestration
│       │   ├── archive/page.tsx     # Global archive
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── components/
│       │   ├── AppShell.tsx         # Shared application shell
│       │   ├── LanguageProvider.tsx
│       │   ├── LanguageToggle.tsx
│       │   ├── SearchModal.tsx      # Global keyboard search
│       │   ├── SynesoLogo.tsx
│       │   ├── ThemeProvider.tsx    # Light / dark / system, read from the browser
│       │   ├── ThemeToggle.tsx
│       │   ├── home/
│       │   │   ├── ExamTimeline.tsx # Countdown, projection and figures
│       │   │   └── TimelineRail.tsx # Activity behind, plan ahead, exam at the end
│       │   ├── shell/
│       │   │   ├── AboutDialog.tsx
│       │   │   ├── NewExamDrawer.tsx
│       │   │   └── SettingsDialog.tsx
│       │   └── exam/
│       │       ├── AnalyticsView.tsx
│       │       ├── FeynmanView.tsx
│       │       ├── FlashcardsView.tsx
│       │       ├── MockExamView.tsx
│       │       └── TopicMap.tsx     # Prerequisites as a graph
│       ├── hooks/
│       │   ├── useFocusTrap.ts      # Keeps keyboard focus inside a dialog
│       │   └── useVoiceRecorder.ts  # Shared voice-recording hook
│       ├── tests/                   # Unit tests for pure modules (node --test)
│       └── lib/
│           ├── api.ts               # Backend API client
│           ├── dates.ts
│           ├── shellStorage.ts      # The three keys Syneso keeps in the browser
│           ├── topicGraph.ts        # Prerequisite layout: topics in, coordinates out
│           └── i18n.ts              # Italian / English strings
└── start.sh                         # Local development launcher (macOS / Linux)
```

---

## 7. Testing & Continuous Integration

The backend test suite uses **pytest** and is organized around the main reliability boundaries of the application:

- Citation matching, page-reference repair, unsupported-claim flags, and hybrid retrieval.
- Database migrations, backup creation, rollback behavior, and deletion cascades.
- Host-header and Origin guards, settings validation, upload validation, and path traversal protection.
- FSRS scheduling and Feynman rubric behavior.
- Mock-exam point allocation and deterministic grading.
- Interrupted SSE generation preserving previously saved notes and flashcards.

Run the backend tests from the repository root:

```bash
cd backend
uv sync --dev
uv run pytest -v
```

Run the small retrieval smoke benchmark separately:

```bash
PYTHONPATH=. uv run python tests/benchmark_retrieval.py
```

### Frontend tests

Pure frontend modules are covered by unit tests that **add no dependencies**: Node runs them and reads the `.ts` files itself.

```bash
cd frontend
npm run test:unit
```

Node does not resolve the `@/` alias, so only modules that do not use it at runtime can be tested this way; everything else is covered end-to-end.

### End-to-end tests

Playwright drives the real application against a stub backend (`backend/tests/e2e/stub_server.py`): real database, real PDF parsing, only the model calls are stubbed.

```bash
cd frontend
npm run test:e2e
```

The suite covers import, notes and highlights, mock exams, persistence, the home timeline, the prerequisite map, first-run onboarding, FSRS review, keyboard focus, and the not-found page. It also captures screenshots of the main screens, which CI pushes to the `screens` branch so that a change in appearance can be reviewed without running the app.

### Continuous integration

`.github/workflows/ci.yml` runs three jobs on every push and pull request: backend (lint and `pytest`), frontend (lint, unit tests, type-check and static build), and end-to-end. Packaging lives in `build-macos.yml` and `build-windows.yml`, which are called by `release.yml` when a `v*` tag is pushed; the release is created as a draft with `SHA256SUMS`.

---

## 8. Quick Start

### Prerequisites

*Installing the packaged application instead? See the [installation guide](docs/installazione.md).*

- **Python 3.11+** and [`uv`](https://docs.astral.sh/uv/)
- **Node.js** (the Windows build workflow uses Node 22)
- A [Groq API key](https://console.groq.com/keys)

### Run locally (macOS / Linux)

```bash
git clone https://github.com/davideorlando-dev/SynesoAI.git
cd SynesoAI

cd backend && uv sync --dev && cd ..
cd frontend && npm install && cd ..

./start.sh
```

Open **`http://localhost:3000`**, go to **Settings**, add your Groq API key, and use **Test Key** to verify the connection. The key is stored in the local application configuration with restrictive file permissions on POSIX systems.

### Standalone builds

The **Build Syneso macOS** and **Build Syneso Windows** workflows build the frontend, run the backend test suite, and package the native application with PyInstaller. On a push to `main` their output is a workflow artifact, which expires and needs a GitHub account to download — useful for testing, not for distribution.

### Publishing a release

The **Release** workflow reuses those same two builds and attaches their installers to a GitHub Release:

```bash
git tag v0.5.1
git push origin v0.5.1
```

The tag must match `backend/app/version.py`, or the workflow stops before building anything. It produces a **draft** release with the DMGs, the Windows zip, `SHA256SUMS.txt` and installation notes; you try the installers and press *Publish release*.


---

## 9. Changelog

What changed in each release is recorded in [CHANGELOG.md](CHANGELOG.md), in Italian.

---

## 10. Licence

Syneso is free software under the **GNU Affero General Public License, version 3 or later** (`AGPL-3.0-or-later`). The full text is in [LICENSE](LICENSE).

What that means in practice:

- You can use it, read it, modify it and pass it on.
- If you distribute it, modified or not, you pass on the same freedoms and the corresponding source.
- If you run a modified version that other people reach over a network, section 13 of the licence requires you to offer them the source of that version. Syneso as shipped is a local desktop application, so this concerns anyone who decides to host it, not someone running it on their own machine.

The licence is not a preference. [PyMuPDF](https://github.com/pymupdf/PyMuPDF), which reads every PDF Syneso ingests, is published under AGPL-3.0 or a commercial licence, and shipping it inside the application makes the combined work AGPL too. [THIRD-PARTY.md](THIRD-PARTY.md) records that, lists the other bundled dependencies, and gives the commands that produce an authoritative licence report.

Your study material, your notes and your API key are yours. The licence covers Syneso's code, not what you put into it.
