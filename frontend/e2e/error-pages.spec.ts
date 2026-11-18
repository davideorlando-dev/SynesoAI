import { expect, test } from "./fixtures";

/**
 * Un indirizzo che non esiste deve dare una pagina, non il vuoto.
 *
 * Nella versione impacchettata il backend serve il frontend con
 * StaticFiles(html=True), che per un percorso sconosciuto restituisce il
 * 404.html generato da not-found.tsx: se quel file sparisse, l'utente
 * vedrebbe un errore nudo di Starlette.
 */

test("un indirizzo sbagliato mostra la pagina «non esiste», non il vuoto", async ({ page }) => {
  await page.goto("/questa-pagina-non-esiste/");

  await expect(page.getByRole("heading")).toContainText(/non esiste/i, { timeout: 20_000 });

  // E da lì si torna a casa con un clic.
  await page.getByRole("link", { name: /torna alla home/i }).click();
  await expect(page).toHaveURL(/\/$/);
});
