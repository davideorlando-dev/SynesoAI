"use client";

import { useEffect, type RefObject } from "react";

/**
 * Tiene il fuoco dentro una finestra finché è aperta.
 *
 * Senza, con Tab si esce dal dialogo e si finisce sulla pagina dietro, che è
 * coperta ma resta raggiungibile: chi naviga da tastiera si ritrova a premere
 * invio su un pulsante che non vede. Al momento della chiusura il fuoco torna
 * da dove era partito, così la tastiera non ricomincia ogni volta dall'inizio
 * della pagina.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function focusable(): HTMLElement[] {
      if (!container) return [];
      const visible: HTMLElement[] = [];
      container.querySelectorAll(FOCUSABLE).forEach((node: Element) => {
        const el = node as HTMLElement;
        // Un elemento nascosto non prende il fuoco: offsetParent è il modo
        // più economico per accorgersene senza leggere gli stili calcolati.
        if (el.offsetParent !== null || el === document.activeElement) visible.push(el);
      });
      return visible;
    }

    // Se nessuno dentro ha già il fuoco (un campo con autoFocus, per esempio),
    // lo prende il primo elemento utile.
    if (!container.contains(document.activeElement)) {
      const first = focusable()[0];
      if (first) first.focus();
      else container.focus();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Tab" || !container) return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      previouslyFocused?.focus?.();
    };
  }, [ref, active]);
}
