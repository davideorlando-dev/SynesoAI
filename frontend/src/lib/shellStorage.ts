/**
 * Quel poco che Syneso ricorda nel browser.
 *
 * Sono tre cose sole — l'esame aperto, l'argomento aperto dentro quell'esame e
 * il nome di chi studia — ma le leggono e le scrivono la home, l'area esame e
 * le impostazioni. Stavano dentro AppShell, e una pagina che voleva solo
 * ricordare l'esame attivo doveva importare un pezzo dell'interfaccia.
 *
 * Ogni accesso è protetto: in una finestra privata localStorage esiste ma
 * lancia, e non è una ragione per non far partire l'applicazione.
 */

export function getSavedActiveExamId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("syneso_active_exam_id");
  } catch {
    return null;
  }
}

export function setSavedActiveExamId(examId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("syneso_active_exam_id", examId);
  } catch {
    // ignore
  }
}

/** Forgets the active exam, and the topic last open in it. */
export function clearSavedActiveExam(examId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!examId || localStorage.getItem("syneso_active_exam_id") === examId) {
      localStorage.removeItem("syneso_active_exam_id");
    }
    if (examId) localStorage.removeItem(`syneso_active_topic_${examId}`);
  } catch {
    // ignore
  }
}

export function getSavedUserName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("syneso_user_name") || "";
  } catch {
    return "";
  }
}

export function setSavedUserName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const clean = name.trim();
    if (clean) localStorage.setItem("syneso_user_name", clean);
    else localStorage.removeItem("syneso_user_name");
  } catch {
    // ignore
  }
}

export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = "syneso_theme";

export function getSavedTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function setSavedTheme(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, preference);
  } catch {
    /* finestra privata: la scelta vale per questa sessione e basta */
  }
}
