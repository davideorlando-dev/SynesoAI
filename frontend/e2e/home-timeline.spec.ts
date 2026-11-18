import { createExamWithImport, expect, test } from "./fixtures";

/**
 * La home è una linea del tempo: un conto alla rovescia, il piano davanti e
 * una frase che dice dove si arriva. Qui si verifica che quei tre pezzi
 * arrivino davvero dal backend e non da un testo scritto a mano.
 *
 * L'esame va sempre indicato nell'URL: il database dei test è condiviso fra
 * le prove, e senza questo la home sceglierebbe l'esame più vicino di tutti.
 */

test("con tempo in abbondanza la home dice che tutto entra", async ({ page, request }) => {
  const examId = await createExamWithImport(request, "Navigazione costiera", {
    examInDays: 23,
  });

  await page.goto(`/?exam=${examId}`);

  const days = page.getByTestId("timeline-days");
  await expect(days).toBeVisible({ timeout: 20_000 });
  await expect(days).toHaveText("23");

  // 23 giorni per 2 ore contro due argomenti da 45 minuti: ci sta tutto.
  await expect(page.getByTestId("timeline-projection")).toContainText(/tutti gli argomenti/i);

  const start = page.getByTestId("timeline-start");
  await expect(start).toBeVisible();
  await start.click();
  await expect(page).toHaveURL(/\/exam\/\?id=/);
});

test("col tempo contato la home dice quanti argomenti entrano e quanto manca", async ({
  page,
  request,
}) => {
  const examId = await createExamWithImport(request, "Esame domani", {
    examInDays: 1,
    dailyHours: 1,
  });

  await page.goto(`/?exam=${examId}`);

  // Un giorno per un'ora sono 60 minuti; due argomenti da 45 ne chiedono 90.
  const projection = page.getByTestId("timeline-projection");
  await expect(projection).toBeVisible({ timeout: 20_000 });
  await expect(projection).toContainText("1 argomento su 2");
  await expect(projection).toContainText("30 minuti in più al giorno");
});

test("senza data d'esame la home non inventa un conto alla rovescia", async ({
  page,
  request,
}) => {
  const examId = await createExamWithImport(request, "Studio libero");

  await page.goto(`/?exam=${examId}`);

  await expect(page.getByTestId("exam-timeline")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("timeline-days")).toHaveCount(0);
  await expect(page.getByTestId("timeline-projection")).toHaveCount(0);
});
