"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Locale, translations } from "@/lib/i18n";

interface LanguageContextValue {
  lang: Locale;
  setLang: (next: Locale) => void;
  t: (typeof translations)[Locale];
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "it",
  setLang: () => {},
  t: translations.it,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Locale>("it");

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem("syneso_lang");
        if (saved === "it" || saved === "en") {
          setLangState(saved);
          return;
        }
        if (typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("it")) {
          setLangState("en");
        }
      } catch {
        // ignore storage errors
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function setLang(next: Locale) {
    setLangState(next);
    try {
      localStorage.setItem("syneso_lang", next);
    } catch {
      // ignore storage errors
    }
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
