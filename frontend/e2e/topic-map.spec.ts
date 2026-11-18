import { createExamWithImport, expect, test } from "./fixtures";

/**
 * La mappa dei prerequisiti.
 *
 * I legami esistono nei dati da sempre: qui si verifica che vengano disegnati
 * e, soprattutto, che la mappa serva a muoversi — un nodo apre il suo
 * argomento, altrimenti è solo un disegno.
 */

test("la mappa disegna i prerequisiti e apre l'argomento che scegli", async ({
  page,
  request,
}) => {
  const examId = await createExamWithImport(request, "Mappa dei prerequisiti");

  await page.goto(`/exam/?id=${examId}&tab=STUDY`);
  await page.getByTestId("toggle-topic-map").click();

  // Due argomenti nel backend di prova, col secondo che richiede il primo.
  await expect(page.getByTestId("topic-map-node")).toHaveCount(2);
  await expect(page.getByTestId("topic-map-edge")).toHaveCount(1);

  await page.getByTestId("topic-map-node").last().click();

  // Scegliere un nodo chiude la mappa e porta all'argomento.
  await expect(page.getByTestId("topic-map-node")).toHaveCount(0);
  await expect(page.getByTestId("generate-notes")).toBeVisible();
});
