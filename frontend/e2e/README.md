# Test end-to-end

Verificano i percorsi dell'utente nell'app vera: database, parsing dei PDF,
migrazioni e piano di studio sono quelli di produzione. Solo le chiamate al
modello sono sostituite da risposte fisse, in
`backend/tests/e2e/stub_server.py`, così i test non dipendono da Groq, da una
chiave API o dalla rete, e danno sempre lo stesso risultato.

## Primo avvio

```bash
cd frontend
npm install                                    # Playwright è già fra le dipendenze
npx playwright install --with-deps chromium    # scarica il browser
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

Undici file, diciotto prove.

| File | Percorso verificato |
|---|---|
| `exam-import.spec.ts` | creazione di un esame, import del PDF in background, apertura del piano; file non valido rifiutato |
| `onboarding.spec.ts` | primo accesso: nome richiesto, pulsante spento sotto i due caratteri, nome ricordato dopo un ricaricamento |
| `home-timeline.spec.ts` | la home: conto alla rovescia, proiezione con tempo abbondante e con tempo contato, nessun conto senza data d'esame |
| `notes.spec.ts` | appunti generati, testo evidenziato col mouse, evidenziazione ritrovata dopo un ricaricamento; formule disegnate da KaTeX |
| `topic-map.spec.ts` | mappa dei prerequisiti: nodi, legame disegnato, e il nodo che apre il suo argomento |
| `flashcards.spec.ts` | ripasso FSRS: la risposta coperta finché non la si chiede, il voto che toglie la carta dal mazzo di oggi |
| `mock-exam.spec.ts` | simulazione generata, compilata e corretta: 30/30 con tutte le risposte, 15/30 con una in bianco |
| `persistence.spec.ts` | bozza Feynman e conversazione col tutor ritrovate dopo un ricaricamento |
| `keyboard.spec.ts` | il fuoco che non esce da una finestra aperta, e l'anello visibile sul primo elemento raggiunto con Tab |
| `error-pages.spec.ts` | un indirizzo inesistente mostra la pagina «non esiste», non il vuoto |
| `screens.spec.ts` | non verifica: fotografa le schermate principali, tema chiaro e scuro, e le spinge sul ramo `screens` |

Restano scoperti il percorso Feynman completo — scrivere una spiegazione,
riceverne la valutazione, trasformare le lacune in flashcard — e il cambio di
tema, che oggi è provato solo dalle fotografie.

## Stato di partenza

I test partono da un utente che ha già usato l'app: la base semina nome e
lingua prima di ogni pagina, altrimenti ogni prova passerebbe dalla schermata
di primo accesso. Chi quella schermata la deve provare usa `forgetUser`, che
dimentica l'utente solo al primo caricamento della scheda. Anche la lingua è
fissata in italiano, altrimenti segue quella del browser e in CI sarebbe
inglese.

Chi ha bisogno di un esame già importato lo prepara con
`createExamWithImport`, che parla direttamente col backend: l'import
dall'interfaccia ha già il suo test e rifarlo a mano ogni volta renderebbe
ambiguo ogni fallimento.
