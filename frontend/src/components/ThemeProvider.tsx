"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { getSavedTheme, setSavedTheme, type ThemePreference } from "@/lib/shellStorage";

/**
 * Chiaro, scuro o come il sistema.
 *
 * La scelta vive in una classe sola su <html>: i token del tema scuro stanno
 * in globals.css e si attivano da lì, quindi nessun componente deve sapere
 * quale tema è attivo.
 *
 * Il tema è stato del browser — localStorage più la preferenza di sistema —
 * e si legge con useSyncExternalStore, che è l'API fatta per questo: durante
 * la generazione statica non c'è né l'uno né l'altra, e leggerli dentro un
 * effetto significherebbe aggiornare lo stato subito dopo il primo disegno.
 * «Come il sistema» segue il sistema operativo anche mentre l'applicazione è
 * aperta: chi tiene il computer su cambio automatico al tramonto non deve
 * ricaricare niente.
 */

const DARK_CLASS = "theme-dark";
const SERVER_SNAPSHOT = "system|light";

type Snapshot = string;

const listeners = new Set<() => void>();
let cached: Snapshot | null = null;
let mediaQuery: MediaQueryList | null = null;

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function computeSnapshot(): Snapshot {
  const preference = getSavedTheme();
  const dark = preference === "dark" || (preference === "system" && systemPrefersDark());
  return `${preference}|${dark ? "dark" : "light"}`;
}

function getSnapshot(): Snapshot {
  // useSyncExternalStore richiede che due letture di fila diano lo stesso
  // valore: senza memoria, React vedrebbe una stringa nuova a ogni disegno.
  if (cached === null) cached = computeSnapshot();
  return cached;
}

function invalidate() {
  cached = null;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!mediaQuery && typeof window !== "undefined" && window.matchMedia) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", invalidate);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && mediaQuery) {
      mediaQuery.removeEventListener("change", invalidate);
      mediaQuery = null;
    }
  };
}

interface ThemeValue {
  preference: ThemePreference;
  isDark: boolean;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue>({
  preference: "system",
  isDark: false,
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const [storedPreference, resolved] = snapshot.split("|");
  const preference = storedPreference as ThemePreference;
  const isDark = resolved === "dark";

  // Lo script in testa alla pagina ha già messo la classe prima del primo
  // disegno: qui si tiene allineata quando la preferenza cambia.
  useEffect(() => {
    document.documentElement.classList.toggle(DARK_CLASS, isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }, [isDark]);

  const setPreference = useCallback((next: ThemePreference) => {
    setSavedTheme(next);
    invalidate();
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, isDark, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
