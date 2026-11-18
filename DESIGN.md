# Il sistema visivo di Syneso

Questo documento è la fonte per ogni decisione visiva dell'applicazione. Quando
il codice e questo file non vanno d'accordo, è il codice a essere sbagliato.

## 1. Da dove viene

Il marchio è una **sigma disegnata come grafo**: quattro nodi ai vertici, tratti
che li collegano, un nodo oro nel punto in cui le linee convergono. Σ è la
somma, i nodi sono i collegamenti, l'oro è il punto in cui qualcosa si unisce.
È il nome dell'applicazione disegnato invece che scritto.

L'interfaccia discende da lì, e da quel marchio prende tre cose.

**Carta, non vetro.** Il fondo è crema (`canvas`), le superfici sono carta
appena più chiara (`paper`). Niente bianchi azzurrati, niente ombre diffuse:
una scheda si distingue perché è più chiara della tela e perché ha un filetto,
non perché galleggia.

**La struttura è fatta di linee.** Il marchio è tratto, non massa. Così
l'interfaccia: filetti da un pixel, angoli contenuti, gerarchia costruita con
peso e dimensione del testo prima che con il colore.

**L'oro è uno solo.** Nel marchio c'è un nodo oro, non cinque. Nell'interfaccia
l'oro segnala *la cosa che conta adesso* — l'argomento aperto, l'avanzamento
corrente, il risultato appena ottenuto. Se l'oro è ovunque, non c'è più nessun
nodo centrale: è la regola più facile da rompere e quella che tiene in piedi
tutto il resto.

## 2. Colore

I token vivono in `frontend/src/app/globals.css`, dentro `@theme`, e si usano
come classi Tailwind (`bg-canvas`, `text-ink-700`, `border-line`). Nessun valore
esadecimale va scritto a mano in un componente.

### Superfici

| Token | Valore | Dove |
|---|---|---|
| `canvas` | `#F4F1EA` | fondo dell'applicazione |
| `paper` | `#FDFCF9` | schede, finestre, pannelli |
| `sunken` | `#EBE7DC` | campi, celle di intestazione, zone incassate |
| `ink-surface` | `#141414` | superfici scure: azioni primarie, barre |

### Inchiostro

Grigi caldi. Il rapporto indicato è misurato sulla tela crema e dice dove quel
colore può stare.

| Token | Valore | Contrasto | Dove |
|---|---|---|---|
| `ink-900` | `#141414` | 16,3:1 | titoli, testo forte, fondo delle azioni primarie |
| `ink-800` | `#2B2824` | 13,0:1 | azione primaria premuta |
| `ink-700` | `#46413A` | 9,0:1 | testo corrente |
| `ink-600` | `#5F594F` | 6,2:1 | testo di servizio |
| `ink-500` | `#6E6758` | 5,0:1 | testo secondario — **il minimo leggibile** |
| `ink-400` | `#9A9285` | 2,7:1 | segnaposto e disabilitati, **mai informazione** |
| `ink-300` | `#BAB2A3` | 1,9:1 | solo decorazione |

### Filetti

`line` `#DCD5C7` per le separazioni normali, `line-strong` `#CFC7B4` quando un
bordo deve reggere da solo (un campo, un contenitore selezionabile).

### Oro

| Token | Valore | Contrasto | Dove |
|---|---|---|---|
| `gold-100` | `#F7EFDC` | — | fondi tenui, evidenziazioni |
| `gold-200` | `#EFE2C2` | — | stato premuto dei fondi tenui |
| `gold-500` | `#D4A848` | 2,0:1 | **riempimenti e segni**: pallini, barre, il nodo del marchio |
| `gold-700` | `#A57A22` | 3,4:1 | icone, bordi, numeri grandi |
| `gold-800` | `#8A6214` | 4,9:1 | l'unico oro che può portare testo piccolo |

**`gold-500` non porta mai testo e non fa mai un bordo sottile**: a 2:1 sulla
crema non si vede. Serve a riempire, non a dire.

### Stati

`ok` `#3F6B4A`, `warn` `#8A5A12`, `danger` `#8F2F2A`, ciascuno con la sua
versione tenue (`-soft`) per i fondi. Sono ritarati sul caldo: un verde o un
rosso presi da una libreria sembrano incollati da un'altra applicazione.

## 3. Gerarchia delle azioni

| Livello | Aspetto | Quante per schermata |
|---|---|---|
| Primaria | fondo `ink-900`, testo `canvas` | una |
| Secondaria | fondo `paper`, bordo `line-strong`, testo `ink-700` | poche |
| Terziaria | solo testo `ink-600`, sottolineato al passaggio | libere |
| Distruttiva | testo `danger`, bordo `danger` al passaggio | una, e mai primaria |

L'oro **non è un livello di azione**: è uno stato. Un bottone oro direbbe
«questa è la cosa che conta adesso», che è vero solo per lo stato attivo.

## 4. Tipografia

Geist Sans per l'interfaccia, Geist Mono per i numeri che devono incolonnarsi
(voti, percentuali, pagine), e il corsivo editoriale (`font-editorial`) solo per
le frasi che parlano dell'applicazione, mai per contenuto dell'utente.

La gerarchia si fa con tre pesi — 400, 600, 700 — e quattro misure. Non si fa
col colore: un testo grigio chiaro non è «meno importante», è meno leggibile.

## 5. Forma e profondità

Raggio delle schede 14px (`--radius-card`), 10–12px per i controlli, pieno solo
per i pallini. **Niente ombre** per separare le superfici: la separazione la
fanno il filetto e il colore della carta. L'ombra resta per ciò che galleggia
davvero sopra il contenuto — finestre modali, tendine, la barretta di selezione.

## 6. Movimento

Transizioni di 150–200 ms su colore e opacità. Niente animazioni d'ingresso sui
contenuti: questa è un'applicazione in cui si lavora per ore, e ciò che si muove
a ogni disegno diventa rumore. Si muove solo ciò che risponde a un gesto.

## 7. Il marchio nell'applicazione

Si usa `SynesoSymbol`, `SynesoWordmark` e `SynesoLockup` da
`components/SynesoLogo.tsx`, mai i file statici: i componenti prendono il
colore dal contesto con `currentColor` e tengono il nodo oro nella tonalità
giusta per il fondo (`on="light" | "dark"`). I file in `public/brand/` servono
fuori dall'applicazione — sito, README, materiali.

Il simbolo non si ruota, non si ricolora nei tratti, non si usa senza il nodo
centrale, e non va sotto i 20px: sotto quella misura i nodi si chiudono. Per le
icone di sistema esiste la variante a tratto spesso (`syneso-app-icon-small`).

## 8. Nessuna emoji

Le emoji non sono un'icona: cambiano disegno su ogni sistema operativo, non
prendono il colore del testo, non si allineano con le altre e portano un registro
che non è quello dell'applicazione. Si usano le icone disegnate di `lucide-react`,
alla misura del testo che accompagnano.

## 9. La home è una linea del tempo

La home non è una griglia di riquadri uguali. È una linea: dietro le attività
registrate, davanti i giorni che il piano ha già scritto, in fondo il blocco
nero dell'esame. Sopra la linea c'è un solo numero grande — i giorni che
mancano — e sotto una sola frase, la proiezione.

Tre regole la tengono in piedi.

**La frase è un calcolo.** "Arrivi all'esame con quattro argomenti su cinque"
esce da `app/core/projection.py`, che confronta i minuti stimati degli argomenti
ancora aperti con le ore al giorno dichiarate e i giorni che restano. Se il dato
manca — nessuna data d'esame — la frase non c'è: la home non riempie i vuoti con
frasi di cortesia.

**L'oro compare una volta sola**, sul marcatore di oggi. È l'unico punto della
schermata che dice "sei qui"; moltiplicarlo lo spegne.

**Ogni cifra in fondo deve essere una cosa che l'applicazione sa e l'utente no.**
Argomenti chiusi, ritenzione FSRS, ultima simulazione, attività degli ultimi
sette giorni. Un numero che l'utente potrebbe contare da sé non merita quella
riga.

## 10. Il carattere dei titoli

I nomi delle sezioni in testa alla pagina sono in **Instrument Serif**, 26px,
peso normale (`font-title`). È l'unico posto dove compare: ha un contrasto alto
fra pieni e sottili, regge sopra i 24px e sotto si assottiglia fino a sparire,
quindi non scende nell'interfaccia.

Tutto il resto resta **Geist**, che a 11px fa il suo mestiere meglio di
qualsiasi grazia, e i numeri restano in **Geist Mono**: un conto alla rovescia
è un dato, non un titolo, e in mono le cifre si incolonnano.

## 11. La mappa dei prerequisiti

La mappa non è una vista «in più»: è il perché dietro l'ordine del piano. I
prerequisiti erano nei dati fin dal primo import e il piano ci calcolava sopra
la sequenza, ma l'utente vedeva solo il risultato.

Due regole la governano. **Si legge da sinistra a destra**: la colonna di un
argomento è la catena di prerequisiti più lunga che lo precede, quindi ciò che
sta a sinistra viene prima davvero, non per estetica. E **ogni nodo è un
pulsante**: la mappa serve a muoversi fra gli argomenti, non a guardare. Se
diventasse una figura da ammirare andrebbe tolta.

La disposizione sta in `lib/topicGraph.ts` e non disegna niente: è una funzione
pura da argomenti a coordinate, così si corregge senza aprire una pagina.

## 12. Il colore dice lo stato, il peso dice la priorità

Priorità e stato sono due cose diverse e per un periodo hanno parlato con la
stessa voce: «Core» era rosso-mattone, cioè si leggeva come un errore invece
che come la cosa più importante da studiare.

Adesso la **priorità è una scala di peso** sullo stesso inchiostro — Core è un
pallino pieno e un riquadro inchiostro, Importante è un pallino a mezza tinta e
un riquadro col filetto, Dettaglio è un cerchietto vuoto e nessun riquadro — e
il **colore resta libero di dire soltanto come sta andando**: verde superato,
ambra in ritardo, rosso un problema vero.

Ne segue una regola per chi aggiunge pezzi: se stai per usare il rosso per
qualcosa che non è andato storto, stai usando il colore al posto della
gerarchia.

## 13. Il tema scuro è la stessa tavolozza, girata

Non esistono due tavolozze da tenere allineate. Esiste una sola scala e, nel
tema scuro, **inchiostro e tela si scambiano**: `--color-ink-900` diventa crema
e `--color-canvas` diventa nero. Per questo ogni bottone primario (fondo
inchiostro, testo tela) e ogni titolo si invertono da soli, senza una classe in
più nei componenti.

Tre cose non si invertono, e sono dichiarate per nome in `globals.css`:

- **`--color-scrim`**, il velo dietro le finestre, che è scuro in tutti e due i
  temi — un velo chiaro non vela niente.
- **`--color-danger-fill` e `--color-warn-fill`**, i riempimenti pieni che
  portano testo bianco. Il token `--color-danger` nel tema scuro schiarisce per
  restare leggibile come testo, e un fondo chiaro con sopra del bianco non si
  legge.
- **I quattro evidenziatori** (`--color-mark-*`): un pennarello è chiaro anche
  di notte, e sopra ci va sempre inchiostro.

La regola per chi aggiunge un colore: se un token serve sia da fondo pieno sia
da testo, sono due token, non uno.

## 14. Dove sei, quando non usi il mouse

Ogni elemento raggiunto con Tab porta un anello d'oro di 2 pixel, staccato di 2
dal bordo. Sta in un punto solo, `globals.css`, e vale per tutto.

**`outline-none` non si usa.** Era sparso in ventisei punti, senza niente al
suo posto: chi navigava da tastiera non sapeva dove si trovava. Se un contorno
dà fastidio in un punto preciso, si cambia il contorno — non lo si toglie.

L'anello usa `:focus-visible` e non `:focus`, perché chi ha appena cliccato sa
già dove si trova, e usa l'oro perché è l'unico colore che resta visibile sia
sulla carta sia nel buio.

**Una finestra aperta trattiene il fuoco** (`useFocusTrap`): con Tab non si
esce dal dialogo per finire sulla pagina dietro, che è coperta ma resterebbe
raggiungibile. Alla chiusura il fuoco torna da dove era partito.

## 15. Quando qualcosa si rompe

Tre pagine, e tutte e tre dicono per prima cosa la stessa frase: **i tuoi dati
sono salvi**. È vero — stanno in un file SQLite sul computer, non nella pagina
che si è rotta — ed è l'unica cosa che una persona vuole sapere in quel
momento.

- `error.tsx` — una pagina non è riuscita a disegnarsi: riprova, torna alla
  home, e dove guardare nel log.
- `not-found.tsx` — un indirizzo che non esiste, di solito un collegamento
  vecchio. Diventa il `404.html` dell'esportazione statica, che il backend
  serve da sé.
- `global-error.tsx` — l'ultima rete, quando salta anche la disposizione di
  base. È **l'unico punto di Syneso dove i colori sono scritti a mano**: qui i
  token potrebbero non essere mai stati applicati, e un messaggio illeggibile
  sarebbe peggio di nessun messaggio.
