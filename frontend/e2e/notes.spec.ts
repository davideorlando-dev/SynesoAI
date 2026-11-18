import { createExamWithImport, expect, test } from "./fixtures";

/**
 * Appunti ed evidenziazioni.
 *
 * È il percorso più intrecciato dell'applicazione: il testo arriva in streaming
 * dal modello, viene disegnato come markdown, l'utente ne seleziona un pezzo
 * col mouse e quel pezzo va ritrovato e riavvolto in un <mark> a ogni
 * successivo disegno della pagina. Stato React, selezione del DOM e
 * persistenza nel database devono restare d'accordo, e nessuna di queste tre
 * cose si rompe in modo visibile a chi compila il codice.
 */

const STUB_NOTES = "Appunti generati dal backend di prova";

test("gli appunti si generano e un'evidenziazione sopravvive al ricaricamento", async ({
  page,
  request,
}) => {
  const examId = await createExamWithImport(request, "Appunti ed evidenziazioni");

  await page.goto(`/exam/?id=${examId}&tab=STUDY`);
  await page.getByTestId("topic-item").first().click();
  await page.getByTestId("generate-notes").click();

  const notes = page.getByTestId("notes-body");
  await expect(notes).toContainText(STUB_NOTES, { timeout: 60_000 });

  // La barra dei comandi degli appunti compare solo a generazione finita, e
  // finché la generazione è in corso la barretta di selezione non viene
  // disegnata: senza questa attesa il test selezionerebbe troppo presto.
  await expect(page.getByTestId("notes-toolbar")).toBeVisible({ timeout: 60_000 });

  // Tre clic selezionano il paragrafo: è un gesto che una persona fa davvero,
  // e non dipende da coordinate come farebbe un trascinamento.
  const paragraph = notes.locator("p").filter({ hasText: STUB_NOTES }).first();
  await paragraph.click({ clickCount: 3 });

  // La barretta di selezione compare e offre i quattro colori.
  await expect(page.locator("[data-selection-toolbar]")).toBeVisible();
  await page.getByTitle("yellow").click();

  const marks = page.locator("mark[data-user-hl]");
  await expect(marks).toHaveCount(1);

  await page.reload();
  await page.getByTestId("topic-item").first().click();

  // Ritrovata: era nel database, e il testo è stato riavvolto al suo posto.
  await expect(page.locator("mark[data-user-hl]")).toHaveCount(1, { timeout: 30_000 });
});

test("una formula scritta con le parentesi protette arriva disegnata", async ({
  page,
  request,
}) => {
  const examId = await createExamWithImport(request, "Formule");

  await page.goto(`/exam/?id=${examId}&tab=STUDY`);
  await page.getByTestId("topic-item").first().click();
  await page.getByTestId("generate-notes").click();
  await expect(page.getByTestId("notes-toolbar")).toBeVisible({ timeout: 60_000 });

  // Il backend di prova scrive \\[ ... \\], la notazione che usano i modelli
  // veri: se arrivasse così com'è, il lettore vedrebbe le graffe e KaTeX non
  // avrebbe disegnato niente.
  const notes = page.getByTestId("notes-body");
  await expect(notes.locator(".katex")).toHaveCount(1, { timeout: 20_000 });
  await expect(notes.locator(".katex").first()).toBeVisible();

  // Non si può cercare "\\frac" nel testo: KaTeX conserva il sorgente LaTeX
  // in un'annotazione MathML per i lettori di schermo, quindi quella stringa
  // c'è anche quando la formula è disegnata benissimo. Il segnale vero è la
  // presenza del nodo disegnato, che prima della correzione era zero.
  const renderedFormula = await notes.locator(".katex-html").first().innerText();
  expect(renderedFormula).toContain("Precision");
});
