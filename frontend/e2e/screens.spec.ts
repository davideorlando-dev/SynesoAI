import { createExamWithImport, expect, test } from "./fixtures";

/**
 * Fotografie delle schermate.
 *
 * Non verificano niente: servono a guardare. Un'interfaccia si giudica a
 * occhio, e senza queste immagini chi lavora sul codice da remoto — o chi
 * rivede una pull request dal telefono — può solo immaginare il risultato.
 * Le immagini finiscono fra gli allegati della run.
 */

test("fotografa le schermate principali", async ({ page, request }) => {
  const examId = await createExamWithImport(request, "Navigazione costiera", {
    examInDays: 23,
  });

  await page.setViewportSize({ width: 1440, height: 900 });

  // L'indicatore di sviluppo di Next non fa parte dell'applicazione e in
  // produzione non esiste: nelle fotografie sarebbe solo un disturbo. Va
  // iniettato a ogni caricamento, non una volta sola, perché ogni navigazione
  // ricomincia da una pagina pulita.
  await page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement("style");
      style.textContent =
        "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important }";
      document.head?.appendChild(style);
    };
    if (document.head) hide();
    else document.addEventListener("DOMContentLoaded", hide);
  });

  await page.goto(`/?exam=${examId}`);
  await expect(page.getByTestId("open-new-exam")).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId("exam-timeline")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "e2e/.screens/01-dashboard.png", fullPage: false });

  await page.goto(`/exam/?id=${examId}&tab=STUDY`);
  await page.getByTestId("topic-item").first().click();
  await page.screenshot({ path: "e2e/.screens/02-studio.png" });

  await page.getByTestId("generate-notes").click();
  await expect(page.getByTestId("notes-toolbar")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "e2e/.screens/03-appunti.png" });

  await page.getByTestId("toggle-topic-map").click();
  await expect(page.getByTestId("topic-map-node").first()).toBeVisible();
  await page.screenshot({ path: "e2e/.screens/06-mappa.png" });
  await page.getByTestId("toggle-topic-map").click();

  await page.getByTestId("theme-dark").click();
  await page.goto(`/?exam=${examId}`);
  await expect(page.getByTestId("exam-timeline")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "e2e/.screens/07-notte.png" });
  await page.goto(`/exam/?id=${examId}&tab=STUDY`);
  await page.screenshot({ path: "e2e/.screens/08-notte-studio.png" });
  await page.getByTestId("theme-light").click();

  await page.goto(`/exam/?id=${examId}&tab=MOCK`);
  await page.getByTestId("mock-start").click();
  await expect(page.getByTestId("mock-answer").first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "e2e/.screens/04-simulazione.png" });

  await page.goto("/");
  await page.getByRole("button", { name: /Impostazioni|Settings/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "e2e/.screens/05-impostazioni.png" });
});
