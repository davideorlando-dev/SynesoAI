import { readFileSync } from "node:fs";
import path from "node:path";
import { APIRequestContext, expect, Page, test as base } from "@playwright/test";
import { BACKEND_ORIGIN } from "./env";

/** PDF scritto dal backend di prova all'avvio, con la stessa libreria che lo leggerà. */
export const FIXTURE_PDF = path.resolve(
  __dirname,
  "../../backend/tests/e2e/.tmp-data/dispensa.pdf"
);

/** Argomenti che il backend di prova estrae sempre da quel PDF. */
export const STUB_TOPICS = ["Principi di navigazione", "Calcolo della velocità"];

/**
 * Test con la diagnostica già collegata.
 *
 * Un test end-to-end che cade dice solo "non ho trovato l'elemento": la causa
 * sta quasi sempre in una richiesta fallita o in un errore in console. Qui
 * raccogliamo entrambi e li stampiamo soltanto quando il test cade, così il
 * log della CI basta a capire cosa è andato storto senza riprodurlo in locale.
 */
export const test = base.extend({
  page: async ({ page }, run, testInfo) => {
    // Al primo accesso l'app mostra una schermata di benvenuto senza
    // intestazione né pannello degli import: questi test partono da un utente
    // che ha già usato l'app. Anche la lingua va fissata, altrimenti segue
    // quella del browser, che in CI è inglese.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("syneso_user_name", "Tester");
        window.localStorage.setItem("syneso_lang", "it");
      } catch {
        // Archiviazione non disponibile: il test cadrà con un messaggio
        // più chiaro del silenzio.
      }
    });

    const notes: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") notes.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      notes.push(`errore JavaScript: ${error.message}`);
    });
    page.on("requestfailed", (request) => {
      notes.push(
        `richiesta fallita: ${request.method()} ${request.url()} — ` +
          `${request.failure()?.errorText ?? "motivo ignoto"}`
      );
    });
    page.on("response", (response) => {
      const url = response.url();
      if (response.ok() || url.includes("/_next/")) return;
      notes.push(`risposta ${response.status()}: ${response.url()}`);
    });

    await run(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      const body = notes.length ? notes.join("\n") : "nessuna richiesta fallita, nessun errore.";
      console.log(`\n--- rete e console di «${testInfo.title}» ---\n${body}\n`);
      await testInfo.attach("rete-e-console.txt", { body, contentType: "text/plain" });
    }
  },
});

export { expect };

/**
 * Apre il modulo del nuovo esame dalla home.
 *
 * Il bottone è disabilitato finché l'app non ha verificato di raggiungere il
 * backend: attenderlo qui, con un messaggio esplicito, distingue "il backend
 * di prova non risponde" da "il modulo non si apre".
 */
export async function openNewExamForm(page: Page): Promise<void> {
  await page.goto("/");

  const open = page.getByTestId("open-new-exam");
  await expect(open, "il frontend non raggiunge il backend di prova").toBeEnabled({
    timeout: 20_000,
  });
  await open.click();
  await expect(page.getByTestId("new-exam-form")).toBeVisible();
}

/**
 * Crea un esame importando il PDF di prova, parlando direttamente col backend.
 *
 * L'import dall'interfaccia ha già il suo test: rifarlo a mano in ogni prova
 * triplicherebbe i tempi e renderebbe ambiguo ogni fallimento. Qui serve solo
 * lo stato di partenza, quindi lo prepariamo dalla porta di servizio e
 * restituiamo l'identificativo dell'esame pronto.
 */
/**
 * Fa dimenticare al browser chi sta studiando.
 *
 * La base delle prove semina nome e lingua prima di ogni pagina, altrimenti
 * ogni test passerebbe dallo schermo del primo accesso. Serve il contrario
 * solo a chi quello schermo lo deve provare.
 */
export async function forgetUser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Solo al primo caricamento della scheda: dopo che l'utente si è
    // presentato, una ricarica deve trovarlo ancora lì.
    if (!window.sessionStorage.getItem("e2e_forgot_user")) {
      window.sessionStorage.setItem("e2e_forgot_user", "1");
      window.localStorage.removeItem("syneso_user_name");
    }
  });
}

export async function createExamWithImport(
  request: APIRequestContext,
  title: string,
  options: { examInDays?: number; dailyHours?: number } = {}
): Promise<string> {
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    title,
    lang: "it",
    daily_hours: String(options.dailyHours ?? 2),
  };
  if (options.examInDays !== undefined) {
    const day = new Date();
    day.setDate(day.getDate() + options.examInDays);
    multipart.exam_date = day.toISOString().slice(0, 10);
  }

  const started = await request.post(`${BACKEND_ORIGIN}/api/imports/exams`, {
    multipart: {
      ...multipart,
      files: {
        name: "dispensa.pdf",
        mimeType: "application/pdf",
        buffer: readFileSync(FIXTURE_PDF),
      },
    },
  });
  expect(started.status(), `avvio dell'import di «${title}»`).toBe(202);
  const { job } = await started.json();

  await expect
    .poll(
      async () => {
        const current = await request.get(`${BACKEND_ORIGIN}/api/imports/${job.id}`);
        const body = await current.json();
        return body.job.status as string;
      },
      {
        message: `l'import di «${title}» non è arrivato a completed`,
        timeout: 60_000,
        intervals: [250, 500, 1000],
      }
    )
    .toBe("completed");

  return job.exam_id as string;
}
