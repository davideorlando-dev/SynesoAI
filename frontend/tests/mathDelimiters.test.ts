import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeMathDelimiters } from "../src/lib/mathDelimiters.ts";

test("una formula in mezzo al testo diventa matematica in linea", () => {
  const out = normalizeMathDelimiters("La precisione \\( TP / (TP + FP) \\) misura...");
  assert.equal(out, "La precisione $TP / (TP + FP)$ misura...");
});

test("una formula su una riga sua diventa un blocco", () => {
  const out = normalizeMathDelimiters(
    "Precisione:\n\\[ \\text{Precision} = \\frac{TP}{TP + FP} \\]\nindica..."
  );
  assert.equal(
    out,
    "Precisione:\n$$\n\\text{Precision} = \\frac{TP}{TP + FP}\n$$\nindica..."
  );
});

test("più formule nello stesso testo vengono convertite tutte", () => {
  const out = normalizeMathDelimiters("\\( a \\) e \\( b \\) e \\[ c \\]");
  assert.ok(out.includes("$a$"));
  assert.ok(out.includes("$b$"));
  assert.ok(out.includes("$$c$$"));
});

test("quello che è già in dollari non viene toccato", () => {
  const source = "Inline $x^2$ e blocco:\n$$\ny = mx + q\n$$\n";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("dentro un blocco di codice la barra resta una barra", () => {
  const source = "Esempio:\n```latex\n\\[ x = 1 \\]\n```\n";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("dentro un frammento di codice in linea non si converte", () => {
  const source = "Scrivi `\\( x \\)` per la matematica in linea.";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("una formula fuori dal codice si converte anche se il testo contiene codice", () => {
  const out = normalizeMathDelimiters("Vedi `codice` e poi \\( x + y \\).");
  assert.equal(out, "Vedi `codice` e poi $x + y$.");
});

test("un delimitatore spaiato resta com'è", () => {
  const source = "Un intervallo \\[0, 1 e basta";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("una formula vuota non diventa due dollari a vuoto", () => {
  const source = "Niente qui: \\[  \\]";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("il testo senza barre rovesciate torna identico", () => {
  const source = "Nessuna formula, solo parole.";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("le lettere greche sopravvivono alla conversione", () => {
  const out = normalizeMathDelimiters("\\( \\alpha + \\beta = \\gamma \\)");
  assert.equal(out, "$\\alpha + \\beta = \\gamma$");
});

test("una parentesi aperta e mai chiusa non si mangia i paragrafi dopo", () => {
  const source =
    "Introduzione \\[ x = 1\n\nUn paragrafo che parla d'altro.\n\nE un altro ancora \\]";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("una formula in linea non attraversa un a capo", () => {
  const source = "Testo \\( a + b\nsu due righe \\) fine";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("un blocco su più righe senza righe vuote si converte", () => {
  const out = normalizeMathDelimiters("\\[\n  a = b \\\\\n  c = d\n\\]");
  assert.ok(out.startsWith("$$\n"));
  assert.ok(out.endsWith("\n$$"));
  assert.ok(out.includes("c = d"));
});

test("un dollaro mai chiuso viene protetto invece di mangiarsi la pagina", () => {
  const out = normalizeMathDelimiters(
    "Naive Bayes usa $P(c)$ e poi $P(E|c) ### Alberi di decisione\n\nTesto dopo."
  );
  // Le due formule chiuse restano; l'ultimo dollaro diventa stampato.
  assert.ok(out.includes("$P(c)$"));
  assert.ok(out.includes("\\$P(E|c)"));
  assert.ok(out.includes("### Alberi di decisione"));
});

test("dollari in numero pari non vengono toccati", () => {
  const source = "Con $a$ e $b$ tutto bene.";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("un blocco in dollari doppi mai chiuso viene protetto", () => {
  const out = normalizeMathDelimiters("Formula:\n$$\nx = 1\n\n## Sezione dopo");
  assert.ok(out.includes("\\$$"));
  assert.ok(out.includes("## Sezione dopo"));
});

test("un dollaro già protetto non viene contato", () => {
  const source = "Il prezzo è \\$5 e la formula $x$.";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("i dollari dentro il codice non contano nel bilancio", () => {
  const source = "Testo `costa 5$` e poi $x$ chiuso.";
  assert.equal(normalizeMathDelimiters(source), source);
});

test("una conversione che lascia i dollari pari non viene riprotetta", () => {
  const out = normalizeMathDelimiters("\\( a \\) e \\( b \\)");
  assert.equal(out, "$a$ e $b$");
});
