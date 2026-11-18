# Sicurezza

## Come segnalare una vulnerabilità

**Non aprire una issue pubblica.** Usa invece
[Security → Report a vulnerability](https://github.com/davideorlando-dev/SynesoAI/security/advisories/new),
che apre una segnalazione privata visibile solo a chi mantiene il progetto.

Nella segnalazione servono: cosa hai trovato, come riprodurlo, e cosa un
attaccante potrebbe ottenere. Rispondo entro una settimana. Se la segnalazione
è valida, la correzione esce in un rilascio e il tuo nome compare nelle note,
se lo vuoi.

---

## Versioni supportate

Syneso è un'applicazione da scrivania che gira sul computer di chi studia. Le
correzioni di sicurezza escono **solo sull'ultima versione pubblicata**: non ci
sono rami di manutenzione per le versioni precedenti.

---

## Cosa rientra

- Esecuzione di codice arbitrario a partire da un PDF o da un'immagine
  importati.
- Lettura o scrittura di file fuori dalla cartella dei dati
  (*path traversal*), tramite import, esportazioni o nomi di file.
- Esposizione della chiave API Groq: nei log, nelle esportazioni, in una
  risposta dell'API o in un file con permessi troppo larghi.
- Una pagina web qualsiasi che riesca a parlare con il backend locale
  (le difese sono il controllo di `Host` e di `Origin` in
  `backend/app/main.py`).
- Iniezione SQL o lettura dei dati di un esame da parte di un altro.

## Cosa non rientra

- **Il contenuto generato dai modelli.** Syneso cita le fonti e verifica le
  citazioni, ma un modello può sbagliare: un appunto impreciso è un difetto di
  qualità, non una vulnerabilità.
- **La chiave API nelle mani di chi usa il computer.** La chiave sta in
  `backend/.env` con permessi `600` dentro una cartella `700`: protegge dagli
  altri utenti della macchina, non da chi è già entrato nel tuo account.
- **L'assenza di firma degli installatori.** È una scelta dichiarata, non un
  difetto: i binari non sono firmati e i sistemi operativi avvisano. Le somme
  di controllo di ogni rilascio permettono di verificare che il file sia
  quello pubblicato.
- Problemi dei servizi di terze parti (Groq, e i pacchetti elencati in
  [THIRD-PARTY.md](THIRD-PARTY.md)): vanno segnalati a loro.

---

## Come sono trattati i dati

Tutto resta sul computer: i PDF, gli appunti, le flashcard e la cronologia
stanno in un file SQLite dentro la cartella dei dati dell'applicazione. Non c'è
nessun server di Syneso, nessun account, nessuna telemetria.

Quello che esce dal computer sono soltanto le richieste al modello (il testo
degli argomenti e i brani di PDF che servono a rispondere) verso l'API di Groq,
e le ricerche sul web quando l'arricchimento è attivo — si disattiva dalle
Impostazioni.

Prima di ogni migrazione del database viene fatta una copia, e ne vengono
conservate cinque in `data/backups/`.
