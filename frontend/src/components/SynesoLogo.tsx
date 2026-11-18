/**
 * Il marchio di Syneso.
 *
 * Una sigma disegnata come grafo: quattro nodi ai vertici, i tratti che li
 * collegano, un nodo oro nel punto in cui le linee convergono.
 *
 * I tratti prendono il colore dal contesto (`currentColor`), così il marchio
 * vive su qualunque fondo senza duplicati colorati a mano. Il nodo centrale è
 * l'eccezione: l'oro ha due tonalità, una per i fondi chiari e una per quelli
 * scuri, e `on` dice quale usare.
 *
 * I file in `public/brand/` sono gli stessi disegni per l'uso fuori
 * dall'applicazione: sito, README, materiali. Dentro l'applicazione si usano
 * questi componenti.
 */

type Surface = "light" | "dark";

/** Oro per fondo chiaro e oro per fondo scuro: la stessa idea, due contrasti. */
const GOLD: Record<Surface, string> = {
  light: "#A57A22",
  dark: "#D4A848",
};

interface MarkProps {
  className?: string;
  /** Il fondo su cui sta il marchio. Decide la tonalità del nodo centrale. */
  on?: Surface;
}

/** Il solo simbolo, quadrato. Non scende sotto i 20px: i nodi si chiuderebbero. */
export function SynesoSymbol({ className = "h-8 w-8", on = "light" }: MarkProps) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      role="img"
      aria-label="Syneso"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M192,48 H64 L128,128 L64,208 H192"
        fill="none"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinejoin="round"
      />
      <circle cx="192" cy="48" r="17" fill="currentColor" />
      <circle cx="64" cy="48" r="17" fill="currentColor" />
      <circle cx="64" cy="208" r="17" fill="currentColor" />
      <circle cx="192" cy="208" r="17" fill="currentColor" />
      <circle cx="128" cy="128" r="22" fill={GOLD[on]} />
    </svg>
  );
}

/** Le lettere, disegnate con lo stesso tratto del simbolo. */
export function SynesoWordmark({ className = "h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 560 112"
      className={className}
      role="img"
      aria-label="Syneso"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        transform="translate(6 6)"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        <path d="M52.7,14.4 A25,25 0 1 0 30,50 A25,25 0 1 1 7.3,85.6" />
        <path d="M90,0 L119,50 L148,0 M119,50 V100" />
        <path d="M188,100 V0 L238,100 V0" />
        <path d="M324,6 H280 V94 H324 M280,50 H318" />
        <path d="M410.7,14.4 A25,25 0 1 0 388,50 A25,25 0 1 1 365.3,85.6" />
        <circle cx="498" cy="50" r="44" />
      </g>
    </svg>
  );
}

/** Simbolo e lettere insieme, nelle proporzioni fissate dal marchio. */
export function SynesoLockup({ className = "h-8", on = "light" }: MarkProps) {
  return (
    <svg
      viewBox="0 0 900 256"
      className={className}
      role="img"
      aria-label="Syneso"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M192,48 H64 L128,128 L64,208 H192"
        fill="none"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinejoin="round"
      />
      <circle cx="192" cy="48" r="17" fill="currentColor" />
      <circle cx="64" cy="48" r="17" fill="currentColor" />
      <circle cx="64" cy="208" r="17" fill="currentColor" />
      <circle cx="192" cy="208" r="17" fill="currentColor" />
      <circle cx="128" cy="128" r="22" fill={GOLD[on]} />
      <g
        transform="translate(310 78)"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        <path d="M52.7,14.4 A25,25 0 1 0 30,50 A25,25 0 1 1 7.3,85.6" />
        <path d="M90,0 L119,50 L148,0 M119,50 V100" />
        <path d="M188,100 V0 L238,100 V0" />
        <path d="M324,6 H280 V94 H324 M280,50 H318" />
        <path d="M410.7,14.4 A25,25 0 1 0 388,50 A25,25 0 1 1 365.3,85.6" />
        <circle cx="498" cy="50" r="44" />
      </g>
    </svg>
  );
}
