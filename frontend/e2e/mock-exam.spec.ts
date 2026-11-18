import { createExamWithImport, expect, test } from "./fixtures";

/**
 * Il backend di prova genera una domanda per argomento del PDF di prova —
 * due — ciascuna da 10 punti, il massimo che lo schema delle domande
 * ammette, e dichiara coperti tutti i punti attesi di una risposta scritta.
 * I voti attesi qui sotto sono quindi esatti, non stime: entrambe risposte
 * 30/30, una sola 15/30.
 */
const QUESTIONS = 2;

test("una simulazione si genera, si compila e viene corretta", async ({ page, request }) => {
  const examId = await createExamWithImport(request, "Simulazione completa");

  await page.goto(`/exam/?id=${examId}&tab=MOCK`);
  await page.getByTestId("mock-start").click();

  const answers = page.getByTestId("mock-answer");
  await expect(answers).toHaveCount(QUESTIONS, { timeout: 30_000 });
  await answers.nth(0).fill("La rotta vera unisce due punti sulla carta nautica.");
  await answers.nth(1).fill("La velocità effettiva è la distanza divisa per il tempo.");

  await page.getByTestId("mock-submit").click();

  const score = page.getByTestId("mock-score");
  await expect(score).toHaveAttribute("data-score", "30", { timeout: 30_000 });
  await expect(score).toHaveAttribute("data-passed", "true");
});

test("una domanda lasciata in bianco non prende punti", async ({ page, request }) => {
  const examId = await createExamWithImport(request, "Simulazione incompleta");

  await page.goto(`/exam/?id=${examId}&tab=MOCK`);
  await page.getByTestId("mock-start").click();

  const answers = page.getByTestId("mock-answer");
  await expect(answers).toHaveCount(QUESTIONS, { timeout: 30_000 });
  await answers.nth(0).fill("La rotta vera unisce due punti sulla carta nautica.");

  await page.getByTestId("mock-submit").click();

  // Metà dei punti, e sotto la soglia: il foglio bianco non prende nulla
  // nemmeno se il modello dichiara coperti i suoi punti attesi.
  const score = page.getByTestId("mock-score");
  await expect(score).toHaveAttribute("data-score", "15", { timeout: 30_000 });
  await expect(score).toHaveAttribute("data-passed", "false");
});
