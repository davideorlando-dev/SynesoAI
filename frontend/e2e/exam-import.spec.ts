import { expect, FIXTURE_PDF, openNewExamForm, STUB_TOPICS, test } from "./fixtures";

test("creating an exam imports the PDF in the background and opens the study plan", async ({
  page,
}) => {
  await openNewExamForm(page);
  await page.getByTestId("new-exam-title").fill("Navigazione");
  await page.getByTestId("new-exam-files").setInputFiles(FIXTURE_PDF);
  await page.getByTestId("new-exam-submit").click();

  // Il modulo si chiude subito: l'import prosegue nel pannello.
  await expect(page.getByTestId("new-exam-form")).toBeHidden();

  const job = page.getByTestId("import-job");
  await expect(job).toHaveAttribute("data-status", "completed", { timeout: 45_000 });

  await page.getByTestId("import-open-exam").click();

  await expect(page.getByRole("heading", { name: /Navigazione/ })).toBeVisible();
  for (const topic of STUB_TOPICS) {
    await expect(page.getByText(topic).first()).toBeVisible();
  }
});

test("an invalid file is refused before the import starts", async ({ page }) => {
  await openNewExamForm(page);
  await page.getByTestId("new-exam-title").fill("File non valido");
  await page.getByTestId("new-exam-files").setInputFiles({
    name: "finto.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("questo non è un PDF"),
  });
  await page.getByTestId("new-exam-submit").click();

  await expect(page.getByTestId("new-exam-form")).toBeVisible();
  await expect(page.getByTestId("import-job")).toHaveCount(0);
});
