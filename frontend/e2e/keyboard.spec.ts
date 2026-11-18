import { createExamWithImport, expect, test } from "./fixtures";

/**
 * L'applicazione usata senza mouse.
 *
 * Due cose che si rompono in silenzio: l'anello che dice dove sei, e il fuoco
 * che resta dentro una finestra aperta. Nessuna delle due si vede guardando
 * una fotografia, ed è per questo che vanno provate.
 */

test("il fuoco resta dentro le impostazioni finché sono aperte", async ({ page, request }) => {
  await createExamWithImport(request, "Tastiera");
  await page.goto("/");
  await expect(page.getByTestId("open-new-exam")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("open-settings").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Venti tabulazioni: più degli elementi che la finestra contiene, quindi
  // senza trappola si finirebbe di sicuro sulla pagina dietro.
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(inside, `il fuoco è uscito dalla finestra al giro ${i + 1}`).toBe(true);
  }

  // Esc chiude e il fuoco torna da dove era partito.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("ogni elemento raggiunto con Tab mostra un anello visibile", async ({ page, request }) => {
  await createExamWithImport(request, "Anello del fuoco");
  await page.goto("/");
  await expect(page.getByTestId("open-new-exam")).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });

  expect(outline).not.toBeNull();
  expect(outline?.style).not.toBe("none");
  expect(parseFloat(outline?.width ?? "0")).toBeGreaterThan(0);
});
