# Contribuire a Syneso

Grazie per l'interesse. Questo documento descrive come si lavora qui: non sono
formalità, sono le regole che hanno tenuto il progetto manutenibile mentre
cresceva.

---

## Il principio

**Prima il test, poi la correzione.** Quando qualcosa non va, la prima cosa da
scrivere è una prova che fallisce per la ragione giusta. Se non si riesce a
scriverla, di solito vuol dire che il problema non è ancora capito.

La seconda regola: **un problema, un ramo, una pull request**. Una PR che
risolve tre cose è una PR che non si può rifiutare per metà.

---

## Preparare l'ambiente

Serve Python 3.12+, Node 22+ e [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/davideorlando-dev/SynesoAI.git
cd SynesoAI

cd backend && uv sync --dev && cd ..
cd frontend && npm install && cd ..

./start.sh      # macOS e Linux
```

Serve una chiave Groq per i modelli: si inserisce dalle Impostazioni
dell'applicazione, non in un file. Viene salvata in `backend/.env` con permessi
`600`.

---

## Prima di aprire una pull request

```bash
cd backend && uv run ruff check . && uv run pytest -q
cd frontend && npm run lint && npm run test:unit && npm run build
cd frontend && npm run test:e2e      # richiede i browser di Playwright
```

La CI esegue le stesse cose su ogni push. Una PR rossa non si unisce: il
problema è nel codice o nella prova, mai nella CI.

---

## Dove va il codice

- **I router fanno HTTP.** Leggono la richiesta, chiamano qualcosa, rispondono.
  La logica sta in `backend/app/core/` ed è testabile senza un server:
  `planner.py`, `projection.py`, `fsrs_engine.py` sono tutti così — dati dentro,
  dati fuori, nessun database e nessun orologio di sistema.
- **Gli errori hanno un tipo e un codice stabile** (`core/errors.py`). Il
  frontend mostra messaggi diversi in base al codice, quindi un errore nuovo è
  una classe nuova, non una stringa.
- **I moduli puri del frontend stanno in `frontend/src/lib/`** e si provano con
  `npm run test:unit`, che non ha dipendenze: li esegue Node, che legge i `.ts`
  da solo. Node non risolve l'alias `@/`, quindi un modulo che lo usa a tempo di
  esecuzione si prova end-to-end.
- **I colori stanno nei token**, mai scritti a mano. Il perché è in
  [DESIGN.md](DESIGN.md), che vale quanto questo documento.

---

## I messaggi di commit

In italiano, all'infinito, e dicono **perché**, non cosa. Il *cosa* si legge
nel diff.

```
Impedire che un dollaro spaiato si mangi gli appunti

La causa è lunga un carattere. Un dollaro che apre una formula e non si
chiude più non resta un dollaro: remark-math prende tutto quello che
segue e lo manda a KaTeX, che si ferma al primo cancelletto.
```

Lo stesso vale per la descrizione della pull request: cosa non andava, perché,
e cosa resta fuori di proposito.

---

## Segnalare un problema

Apri una [issue](https://github.com/davideorlando-dev/SynesoAI/issues) e dicci:

1. cosa stavi facendo,
2. cosa ti aspettavi,
3. cosa è successo invece,
4. il contenuto di `syneso.log` se c'entra qualcosa (**togli la chiave API se
   compare**).

Una fotografia dello schermo vale più di una descrizione: quasi tutti i difetti
visivi di questo progetto sono stati trovati così.

---

## Lingua

Il codice, i nomi delle funzioni e i prompt dei modelli sono in inglese. I
commenti, i messaggi di commit, la documentazione d'uso e l'interfaccia sono in
italiano e in inglese. Un commento esiste per dire quello che il codice non può
dire: se ripete il nome della funzione, va tolto.

---

## Licenza

Contribuendo accetti che il tuo contributo sia distribuito sotto
[AGPL-3.0](LICENSE), come il resto del progetto.
