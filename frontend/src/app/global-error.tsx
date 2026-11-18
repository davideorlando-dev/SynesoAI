"use client";

/**
 * L'ultima rete: un errore nella disposizione di base.
 *
 * Questo file sostituisce tutto, compreso il layout principale, quindi deve
 * portarsi dietro <html> e <body> e non può usare né i provider né i token
 * del tema: quando arriva qui, può darsi che il foglio di stile non sia mai
 * stato applicato. Per questo i colori sono scritti a mano — è l'unico punto
 * di Syneso dove è giusto farlo — e il testo è in italiano, la lingua
 * predefinita, perché il provider della lingua non esiste più.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f1ea",
          color: "#141414",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Syneso non è riuscito ad avviarsi</h1>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.6, color: "#46413a" }}>
            I tuoi appunti, le flashcard e gli esami sono salvati sul tuo computer e non sono
            stati toccati. Il dettaglio tecnico è nel file syneso.log, accanto ai tuoi dati.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.25rem",
              borderRadius: "14px",
              border: "none",
              background: "#141414",
              color: "#f4f1ea",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Riprova
          </button>
          {error.digest && (
            <p style={{ marginTop: "1rem", fontSize: "0.6875rem", color: "#6e6758" }}>
              ({error.digest})
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
