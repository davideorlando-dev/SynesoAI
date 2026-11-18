# Registro delle modifiche

Le versioni seguono [SemVer](https://semver.org/lang/it/). Finché il numero
principale resta a zero, il formato dei dati può cambiare fra una minore e
l'altra: Syneso fa una copia del database prima di ogni migrazione e ne
conserva cinque in `data/backups/`.

---

## 0.5.1 — 18 novembre 2026

Correzioni alla resa delle formule, trovate usando l'applicazione su dispense
vere di machine learning.

- **Le formule arrivano disegnate.** I modelli scrivono la matematica con
  `\( \)` e `\[ \]`, che in Markdown sono parentesi protette: la barra
  spariva e la formula compariva come testo nudo. Ora vengono convertite al
  momento di disegnare — quindi vale anche per gli appunti già salvati — e i
  prompt chiedono direttamente i dollari.
- **Un dollaro spaiato non cancella più la pagina.** Se una formula non viene
  chiusa, tutto quello che segue — titoli, elenchi, paragrafi — finiva dentro
  la formula e diventava un muro di errore rosso. Adesso il delimitatore
  rimasto aperto viene protetto e compare come un dollaro stampato.
- **Le formule nelle tabelle non si accavallano.** In una cella più stretta
  della formula il browser spezzava la frazione a metà; ora la formula scorre
  invece di rompersi.
- **Console pulita.** KaTeX protestava a ogni disegno per le lettere accentate
  italiane dentro `\text{}`, che renderizza benissimo: gli avvisi sono
  silenziati, e una formula malscritta compare in rosso al suo posto invece di
  far cadere la pagina.

Nota di servizio: da questa versione il progetto vive in una nuova repository,
`SynesoAI`.

---

## 0.5.0 — 18 novembre 2026

Il rilascio che cambia faccia all'applicazione. Chi arriva dalla 0.4.0 trova gli
stessi dati e un'interfaccia riscritta attorno a una sola domanda: *arrivo in
tempo?*

### La home è una linea del tempo

La griglia di riquadri è sparita. Al suo posto una linea: dietro le attività
registrate, davanti i giorni che il piano ha già scritto, in fondo il blocco
dell'esame. Sopra un numero solo — i giorni che mancano — e sotto una frase.

Quella frase è un calcolo, non un incoraggiamento: `core/projection.py`
confronta i minuti stimati degli argomenti ancora aperti con le ore al giorno
dichiarate e i giorni che restano, e dice quanti argomenti entrano, qual è il
primo che resta fuori e quanti minuti in più al giorno servirebbero per
prenderli tutti. Senza una data d'esame la frase non compare: non si inventa un
conto alla rovescia.

### La mappa dei prerequisiti

I prerequisiti esistevano dal primo import e il piano ci calcolava sopra
l'ordine degli argomenti, ma nessuno li aveva mai visti. Adesso si aprono da
Studio: si legge da sinistra a destra, e la colonna di un argomento è la catena
di prerequisiti più lunga che lo precede. Ogni nodo apre il suo argomento.

### Modalità notte

Tre stati nella testata — come il sistema, chiaro, scuro — e la scelta resta sul
dispositivo. Non è una seconda tavolozza: è la stessa, girata, con inchiostro e
tela che si scambiano. Il tema si applica prima che la pagina si disegni, quindi
non c'è nessun lampo bianco all'avvio.

### Un marchio, applicato davvero

Il simbolo nuovo era entrato nella 0.4.0 ma si fermava alla cornice: l'area
esame era ancora indaco su bianco dentro una tela crema. Ora i 615 colori
rimasti sono token, i titoli di sezione sono in Instrument Serif, e **l'icona
nella scheda del browser cambia davvero** — il suo indirizzo portava `?v=3` dal
primo rilascio, quindi ogni browser continuava a servire la vecchia dalla
cache.

### Tastiera e guasti

- Ogni elemento raggiunto con Tab mostra un anello d'oro: prima il contorno era
  tolto in ventisei punti e non sostituito da niente.
- Le finestre trattengono il fuoco e alla chiusura lo restituiscono.
- Tre pagine d'errore al posto dello schermo bianco, e tutte dicono per prima
  cosa che i dati sono salvi, perché è vero.

### Sotto il cofano

- `AppShell.tsx` da 1.116 righe a 588, con le finestre e il cassetto del nuovo
  esame in moduli propri.
- Test unitari nel frontend **senza aggiungere dipendenze**: li esegue Node, che
  legge i `.ts` da solo.
- La priorità di un argomento è una scala di peso; il colore dice soltanto come
  sta andando.

### Prove

101 test sul backend, 11 unitari nel frontend, 16 end-to-end — comprese le due
nuove sul primo accesso e sul ripasso FSRS, e due che provano quello che nessuna
fotografia mostra: il fuoco che non esce da una finestra e l'anello che si vede.

---

## 0.4.0 — 17 novembre 2026

Primo rilascio pubblico: licenza AGPL-3.0, tre installatori non firmati con le
somme di controllo, note d'installazione in italiano.

Oltre al confezionamento, la 0.4.0 ha portato la correzione del punteggio delle
simulazioni (una domanda lasciata in bianco non prende punti, e i punti attesi
vengono allineati alla lettera invece che per somiglianza), un middleware che
cattura gli errori non gestiti e risponde con un codice stabile, e la prima
impalcatura di prove end-to-end con Playwright.
