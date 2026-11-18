import { createExamWithImport, expect, test } from "./fixtures";

/**
 * Quello che l'utente ha scritto deve sopravvivere a un ricaricamento.
 *
 * Bozza Feynman e conversazioni col tutor vivono nel database, non nello stato
 * del browser: questi test lo verificano dall'unico punto di vista che conta,
 * ricaricando la pagina e guardando se il testo è ancora lì.
 */

test("la bozza Feynman si ritrova dopo un ricaricamento", async ({ page, request }) => {
  const examId = await createExamWithImport(request, "Bozza Feynman");
  const draft = "La rotta vera è l'angolo fra il meridiano e la direzione da seguire.";

  await page.goto(`/exam/?id=${examId}&tab=FEYNMAN`);
  await page.getByTestId("feynman-topic").first().click();
  await page.getByTestId("feynman-explanation").fill(draft);

  // Attendere la risposta del salvataggio, e non la scritta «Bozza salvata»,
  // che dopo due secondi scompare: il ricaricamento non deve correre contro
  // la richiesta ancora in volo.
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/feynman-draft") && response.request().method() === "PUT"
    ),
    page.getByTestId("feynman-save-draft").click(),
  ]);

  await page.reload();
  await page.getByTestId("feynman-topic").first().click();

  await expect(page.getByTestId("feynman-explanation")).toHaveValue(draft);
});

test("la conversazione col tutor si ritrova dopo un ricaricamento", async ({ page, request }) => {
  const examId = await createExamWithImport(request, "Chat col tutor");
  const question = "Puoi farmi un esempio pratico?";

  await page.goto(`/exam/?id=${examId}&tab=STUDY`);
  await page.getByTestId("topic-item").first().click();
  await page.getByTestId("tutor-input").fill(question);
  await page.getByTestId("tutor-send").click();

  const messages = page.getByTestId("tutor-message");
  await expect(messages).toHaveCount(1, { timeout: 30_000 });
  await expect(messages.first()).toContainText(question);
  await expect(messages.first()).toContainText("Risposta del tutor di prova.");

  await page.reload();
  await page.getByTestId("topic-item").first().click();

  await expect(page.getByTestId("tutor-message")).toHaveCount(1);
  await expect(page.getByTestId("tutor-message").first()).toContainText(question);
});
