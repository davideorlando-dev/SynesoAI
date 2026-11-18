# Test unitari del frontend

`npm run test:unit`

Niente da installare: li esegue Node, che da solo sa già leggere i `.ts`
(`node --test --experimental-strip-types`). Nessuna dipendenza nuova significa
nessun lockfile da tenere allineato e nessun tempo di installazione in più
sulla CI, che è la ragione per cui non c'è vitest.

## Che cosa va qui dentro

Moduli puri: dentro dati, fuori dati, nessun React e nessuna rete. Oggi
`lib/topicGraph.ts` e `lib/topicPriority.ts`.

Un limite da conoscere prima di aggiungere un test: Node non risolve l'alias
`@/`, quindi qui si importa con percorsi relativi e con l'estensione (`.ts`), e
si possono provare solo i moduli che a loro volta non importano con l'alias a
tempo di esecuzione. Un `import type` non conta: sparisce prima di arrivare a
Node.

Tutto il resto — componenti, pagine, percorsi dell'utente — si prova con
Playwright in `../e2e`.
