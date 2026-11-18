import { BACKEND_ORIGIN } from "./env";
import { expect, forgetUser, test } from "./fixtures";

/**
 * Il primo accesso: la schermata che vede chi apre Syneso la prima volta.
 *
 * È l'unico percorso che richiede un'applicazione davvero vuota, quindi il
 * test comincia svuotandola: il database delle prove è condiviso e gli esami
 * creati prima nasconderebbero lo schermo di benvenuto. Le prove che seguono
 * creano il proprio esame, quindi non resta niente in sospeso.
 */

test("il primo accesso chiede il nome e poi apre l'applicazione", async ({ page, request }) => {
  const overview = await (await request.get(`${BACKEND_ORIGIN}/api/exams/overview`)).json();
  for (const item of overview.items ?? []) {
    await request.delete(`${BACKEND_ORIGIN}/api/exams/${item.exam.id}`);
  }

  await forgetUser(page);
  await page.goto("/");

  const start = page.getByTestId("welcome-start");
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();

  // Due caratteri sono il minimo: con uno solo il pulsante resta spento.
  const name = page.getByTestId("welcome-name");
  await name.fill("D");
  await expect(page.getByTestId("welcome-continue")).toBeDisabled();

  await name.fill("Davide");
  await page.getByTestId("welcome-continue").click();

  // Dato il nome, compare l'applicazione vera: la barra e il pulsante
  // per creare il primo esame.
  await expect(page.getByTestId("open-new-exam")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("welcome-start")).toHaveCount(0);

  // E il nome resta sul dispositivo: ricaricando non lo richiede più.
  await page.reload();
  await expect(page.getByTestId("open-new-exam")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("welcome-start")).toHaveCount(0);
});
