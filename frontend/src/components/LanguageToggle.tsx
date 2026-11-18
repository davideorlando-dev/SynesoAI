"use client";

import { useLanguage } from "./LanguageProvider";

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)]/80 p-0.5 text-[11px] font-bold"
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLang("it")}
        className={`w-7 rounded-md py-1 text-center transition ${
          lang === "it"
            ? "bg-[var(--color-paper)] text-[var(--color-ink-900)] shadow-2xs"
            : "text-ink-500 hover:text-[var(--color-ink-900)]"
        }`}
      >
        IT
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`w-7 rounded-md py-1 text-center transition ${
          lang === "en"
            ? "bg-[var(--color-paper)] text-[var(--color-ink-900)] shadow-2xs"
            : "text-ink-500 hover:text-[var(--color-ink-900)]"
        }`}
      >
        EN
      </button>
    </div>
  );
}
