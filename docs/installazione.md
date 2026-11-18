# Installare e usare Syneso

Guida per chi scarica l'applicazione già pronta. Se vuoi invece eseguirla dal
codice, vedi la sezione *Quick Start* del [README](../README.md).

## 1. Scaricare

Vai alla pagina
[Releases](https://github.com/davideorlando-dev/SynesoAI/releases) e scarica il
file che corrisponde al tuo computer.

| File | Per |
|---|---|
| `Syneso-<versione>-macOS-arm64.dmg` | Mac con Apple Silicon (M1 e successivi) |
| `Syneso-<versione>-macOS-x64.dmg` | Mac con processore Intel |
| `Syneso-<versione>-Windows-x64.zip` | Windows 10 e 11 a 64 bit |

Se non sai quale Mac hai: menu  → *Informazioni su questo Mac*. Alla voce
*Chip* un M1, M2, M3 o M4 vuol dire `arm64`; *Processore Intel* vuol dire
`x64`.

## 2. Installare su macOS

Apri il DMG e trascina Syneso nella cartella Applicazioni.

Al primo avvio macOS lo blocca, perché l'applicazione non è firmata con un
certificato Apple a pagamento. Non è un difetto del tuo download: succede a
qualunque app distribuita senza quel certificato.

- **Clic destro sull'icona di Syneso → Apri**, poi conferma. Serve una volta
  sola: dai lanci successivi si apre normalmente.
- Se compare *«Syneso è danneggiato e non può essere aperto»*, macOS ha messo
  il file in quarantena. Rimuovila dal Terminale e riprova:

  ```bash
  xattr -dr com.apple.quarantine /Applications/Syneso.app
  ```

## 3. Installare su Windows

Estrai lo zip dove preferisci — per esempio in `Documenti\Syneso` — e avvia
`Syneso.exe` dalla cartella `Syneso`. Tienila dov'è: l'eseguibile ha bisogno
dei file che gli stanno accanto.

Anche qui l'eseguibile non è firmato, quindi SmartScreen avvisa al primo
avvio: **Ulteriori informazioni → Esegui comunque**.

## 4. Prima apertura: la chiave Groq

Syneso fa girare i modelli su [Groq](https://groq.com), con la **tua** chiave:
non c'è un server di Syneso in mezzo, e non c'è niente da pagare a noi.

1. Apri [console.groq.com/keys](https://console.groq.com/keys) e crea un
   account: il piano gratuito basta per studiare.
2. Crea una chiave e copiala (inizia per `gsk_`).
3. In Syneso: **Impostazioni → Chiave API**, incolla, poi **Test chiave** per
   verificare che risponda.

La chiave resta sul tuo computer, in un file di configurazione leggibile solo
dal tuo utente. Su Groq puoi revocarla quando vuoi.

## 5. Dove stanno i tuoi dati

Tutto il materiale di studio è sul tuo computer, in una sola cartella:

| Sistema | Cartella |
|---|---|
| macOS | `~/Library/Application Support/Syneso` |
| Windows | `%APPDATA%\Syneso` |
| Linux | `~/.local/share/Syneso` |

Dentro trovi:

- `data/syneso.db` — il database: esami, argomenti, appunti, flashcard,
  simulazioni, cronologia delle ripetizioni.
- `data/uploads/` — i PDF che hai importato.
- `data/backups/` — copie del database create automaticamente prima di ogni
  aggiornamento della sua struttura, e tenute le ultime cinque.
- `.env` — la tua chiave API.
- `syneso.log` — il diario di cosa ha fatto l'app.

Verso Groq partono soltanto i frammenti necessari a generare gli appunti,
valutare le tue spiegazioni e trascrivere la voce. I file, il database e lo
stato delle ripetizioni non escono dal tuo computer.

**Per fare un backup**, copia quella cartella. Per spostare Syneso su un altro
computer, installa l'app e copia la cartella al suo posto.

## 6. Aggiornare

Scarica la versione nuova dalla pagina Releases e installala sopra la
precedente: su macOS trascinando di nuovo in Applicazioni, su Windows
sostituendo la cartella estratta. I tuoi dati stanno altrove e non vengono
toccati.

Se la nuova versione cambia la struttura del database, Syneso ne fa una copia
in `data/backups/` prima di aggiornarlo.

Per sapere quale versione stai usando: **menu dell'app → Informazioni su
Syneso**, il numero è in fondo alla finestra.

## 7. Disinstallare

Elimina l'applicazione — da Applicazioni su macOS, la cartella estratta su
Windows — e poi, se vuoi cancellare anche il materiale di studio, la cartella
dei dati indicata al punto 5. Finché quella cartella esiste, reinstallando
ritrovi tutto.

## 8. Quando qualcosa non va

Il file `syneso.log`, nella cartella dei dati, dice cosa è andato storto. È
testo: puoi aprirlo con qualunque editor e leggerlo.

Se vuoi [segnalare un problema](https://github.com/davideorlando-dev/SynesoAI/issues),
servono tre cose: la versione (punto 6), il sistema operativo e cosa stavi
facendo. Le ultime righe del log, se ce ne sono, aiutano molto. Prima di
incollarlo, dagli un'occhiata: non contiene la tua chiave API, ma può
contenere i titoli dei tuoi esami e dei tuoi file.
