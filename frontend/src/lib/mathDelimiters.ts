/**
 * Porta le formule alla notazione che il renderer capisce.
 *
 * KaTeX è montato dietro remark-math, che riconosce `$...$` e `$$...$$`. I
 * modelli però scrivono volentieri `\( ... \)` e `\[ ... \]`, e in Markdown
 * quella barra rovesciata è un carattere di protezione: `\[` diventa una
 * parentesi quadra normale, quindi la formula finisce a schermo come l'ha
 * scritta il modello — `[ \text{Precision} = \frac{TP}{TP + FP} ]`.
 *
 * La conversione si fa qui, al momento di disegnare, e non una volta sola nel
 * database: gli appunti già salvati sono migliaia di righe che nessuno
 * dovrebbe riscrivere per un difetto di notazione, e il modello può tornare a
 * sbagliare domani.
 *
 * Il codice resta intoccato: dentro un blocco o un frammento di codice una
 * barra rovesciata è quello che è, e trasformarla sarebbe un danno.
 */

/**
 * Come rendere le formule.
 *
 * `strict: "ignore"` perché gli appunti sono in italiano: una «à» dentro
 * \text{} o un apostrofo tipografico fanno protestare KaTeX a ogni disegno,
 * pur venendo resi correttamente. Quelle proteste riempivano la console senza
 * dire niente di utile.
 *
 * `throwOnError: false` perché una formula malscritta dal modello deve
 * comparire in rosso dentro gli appunti, non far cadere la pagina intera.
 */
export const KATEX_OPTIONS = {
  strict: "ignore" as const,
  throwOnError: false,
  trust: false,
};

const CODE_SEGMENT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
// Una formula non attraversa una riga vuota e una formula in linea non
// attraversa nemmeno un a capo: se il modello dimentica di chiudere una
// parentesi, deve restare una parentesi aperta in un testo, non diventare un
// paragrafo intero spedito dentro la modalità matematica.
const DISPLAY_MATH = /\\\[((?:(?!\n[ \t]*\n)[\s\S])*?)\\\]/g;
const INLINE_MATH = /\\\(([^\n]*?)\\\)/g;

function convertOutsideCode(text: string): string {
  const withDisplay = text.replace(DISPLAY_MATH, (match, inner: string, offset: number) => {
    const body = inner.trim();
    if (body.length === 0) return match;
    // Una formula che sta su una riga sua va resa come blocco: remark-math
    // tratta `$$` come display solo quando apre la riga.
    const before = text.slice(0, offset);
    const alone = /(^|\n)[ \t]*$/.test(before);
    return alone ? `$$\n${body}\n$$` : `$$${body}$$`;
  });

  return withDisplay.replace(INLINE_MATH, (match, inner: string) => {
    const body = inner.trim();
    return body.length === 0 ? match : `$${body}$`;
  });
}


/**
 * Protegge l'ultimo delimitatore rimasto aperto.
 *
 * Un dollaro che apre una formula e non si chiude più non resta un dollaro:
 * remark-math prende tutto quello che segue — titoli, elenchi, paragrafi — e
 * lo manda a KaTeX, che si ferma al primo cancelletto e restituisce un muro
 * rosso. Un errore di battitura del modello, lungo un carattere, cancella
 * mezza pagina di appunti.
 *
 * Quando i delimitatori sono in numero dispari, l'ultimo viene protetto con
 * una barra rovesciata: comparirà come un dollaro stampato, che è brutto ma
 * vero, e tutte le formule prima di lui restano intatte.
 *
 * Display e in linea si contano separatamente, perché remark-math li tratta
 * come due cose diverse.
 */
function escapeUnclosedDollars(text: string): string {
  const inline: number[] = [];
  const display: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "$") continue;
    if (i > 0 && text[i - 1] === "\\") continue;
    if (text[i + 1] === "$") {
      display.push(i);
      i += 1;
    } else {
      inline.push(i);
    }
  }

  const toEscape: number[] = [];
  if (display.length % 2 === 1) toEscape.push(display[display.length - 1]);
  if (inline.length % 2 === 1) toEscape.push(inline[inline.length - 1]);
  if (toEscape.length === 0) return text;

  // Dal fondo verso l'inizio, così gli indici restano validi.
  return toEscape
    .sort((a, b) => b - a)
    .reduce((acc, index) => acc.slice(0, index) + "\\" + acc.slice(index), text);
}

export function normalizeMathDelimiters(markdown: string): string {
  if (!markdown) return markdown;

  // Lo split con gruppo di cattura restituisce, alternati, i pezzi di testo e
  // i pezzi di codice: i secondi tornano fuori identici.
  return markdown
    .split(CODE_SEGMENT)
    .map((segment, index) =>
      index % 2 === 1 ? segment : escapeUnclosedDollars(convertOutsideCode(segment))
    )
    .join("");
}
