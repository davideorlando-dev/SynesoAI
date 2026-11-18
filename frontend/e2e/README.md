# Test end-to-end

Verificano i percorsi dell'utente nell'app vera: database, parsing dei PDF,
migrazioni e piano di studio sono quelli di produzione. Solo le chiamate al
modello sono sostituite da risposte fisse, in
`backend/tests/e2e/stub_server.py`, così i test non dipendono da Groq, da una
chiave API o dalla rete, e danno sempre lo stesso risultato.

## Primo avvio

```bash
cd frontend
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

## Eseguirli

```bash
npm run test:e2e        # tutti, senza finestra
npm run test:e2e:ui     # con l'interfaccia di Playwright, per guardarli
```

Playwright avvia da solo il backend di prova (porta 8101) e il frontend
(porta 3101). Sono porte diverse da quelle di `start.sh`, così i test non
toccano il backend di sviluppo né i dati di chi sta lavorando: il backend di
prova usa una cartella dati temporanea, ricreata a ogni avvio.

## Cosa coprono oggi

| File | Percorso verificato |
|---|---|
| `exam-import.spec.ts` | creazione di un esame, import del PDF in background, apertura del piano; file non valido rifiutato |
| `mock-exam.spec.ts` | simulazione generata, compilata e corretta: 30/30 con tutte le risposte, 15/30 con una in bianco |
| `persistence.spec.ts` | bozza Feynman e conversazione col tutor ritrovate dopo un ricaricamento |
| `screens.spec.ts` | non verifica: fotografa le schermate principali e le allega alla run della CI |
| `notes.spec.ts` | appunti generati, testo evidenziato col mouse, evidenziazione ritrovata dopo un ricaricamento |

In arrivo: evidenziazioni sugli appunti, e la schermata di primo accesso.

## Stato di partenza

I test partono da un utente che ha già usato l'app: al primo accesso
l'interfaccia è un'altra, senza intestazione né pannello degli import, e
merita un test suo. La lingua è fissata in italiano, altrimenti segue quella
del browser. Chi ha bisogno di un esame già importato lo prepara con
`createExamWithImport`, che parla direttamente col backend: l'import
dall'interfaccia ha già il suo test e rifarlo a mano ogni volta renderebbe
ambiguo ogni fallimento.
