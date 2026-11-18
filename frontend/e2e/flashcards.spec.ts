import { createExamWithImport, expect, test } from "./fixtures";

/**
 * Il ripasso con la ripetizione dilazionata.
 *
 * È il percorso che decide se l'utente ricorda: la carta si scopre, si dà un
 * voto, e l'algoritmo FSRS riprogramma la prossima volta. Finora nessuna prova
 * lo attraversava, quindi una carta che non fosse più comparsa dopo il voto
 * sarebbe passata inosservata.
 */

test("una carta si scopre, si vota e lascia il posto alla successiva", async ({
  page,
  request,
}) => {
  const examId = await createExamWithImport(request, "Ripasso FSRS");

  // Le carte nascono con gli appunti: prima vanno generati.
  await page.goto(`/exam/?id=${examId}&tab=STUDY`);
  await page.getByTestId("topic-item").first().click();
  await page.getByTestId("generate-notes").click();
  await expect(page.getByTestId("notes-toolbar")).toBeVisible({ timeout: 60_000 });

  await page.goto(`/exam/?id=${examId}&tab=FLASHCARDS`);

  // La risposta non si vede finché non la si chiede: è il punto del metodo.
  const reveal = page.getByTestId("flashcard-reveal");
  await expect(reveal).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("flashcard-rate-3")).toHaveCount(0);

  await reveal.click();
  await expect(page.getByTestId("flashcard-rate-3")).toBeVisible();

  // «Bene»: la carta esce dal mazzo di oggi e torna quella coperta.
  await page.getByTestId("flashcard-rate-3").click();
  await expect(page.getByTestId("flashcard-rate-3")).toHaveCount(0);
  await expect(page.getByTestId("flashcard-reveal")).toBeVisible({ timeout: 20_000 });

  // Votata anche la seconda, per oggi non resta niente da ripassare.
  await page.getByTestId("flashcard-reveal").click();
  await page.getByTestId("flashcard-rate-3").click();
  await expect(page.getByTestId("flashcard-reveal")).toHaveCount(0, { timeout: 20_000 });
});
