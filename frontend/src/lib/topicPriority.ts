/** Priorità di un argomento nel piano di studio. */
export type TopicPriority = "CORE" | "IMPORTANT" | "DETAIL";

export const TOPIC_PRIORITIES: readonly TopicPriority[] = ["CORE", "IMPORTANT", "DETAIL"];

/**
 * Colore del pallino che segnala la priorità.
 *
 * Sta qui perché lo usano sia la lista degli argomenti sia il piano: averne
 * una copia per parte significa che prima o poi i due elenchi mostrano colori
 * diversi per la stessa cosa.
 */
export const PRIORITY_DOT: Record<TopicPriority, string> = {
  CORE: "bg-[var(--color-ink-900)]",
  IMPORTANT: "bg-[var(--color-ink-400)]",
  DETAIL: "border border-[var(--color-ink-300)] bg-transparent",
};

/** Riquadro della priorità, per il selettore in testa all'argomento. */
export const PRIORITY_STYLE: Record<TopicPriority, string> = {
  CORE: "bg-[var(--color-ink-900)] text-[var(--color-canvas)] border-[var(--color-ink-900)]",
  IMPORTANT: "bg-[var(--color-paper)] text-ink-700 border-[var(--color-line-strong)]",
  DETAIL: "bg-transparent text-ink-500 border-[var(--color-line)]",
};
