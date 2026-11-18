"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemePreference } from "@/lib/shellStorage";

/** Sistema, chiaro, scuro — con la stessa forma del cambio di lingua. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const { t } = useLanguage();
  const tt = t.theme;

  const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: "system", label: tt.system, Icon: Monitor },
    { value: "light", label: tt.light, Icon: Sun },
    { value: "dark", label: tt.dark, Icon: Moon },
  ];

  return (
    <div
      className="inline-flex shrink-0 items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)]/80 p-0.5"
      role="group"
      aria-label={tt.groupLabel}
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setPreference(value)}
          title={label}
          aria-label={label}
          aria-pressed={preference === value}
          data-testid={`theme-${value}`}
          className={`rounded-md px-1.5 py-1 transition ${
            preference === value
              ? "bg-[var(--color-paper)] text-[var(--color-ink-900)] shadow-2xs"
              : "text-ink-500 hover:text-[var(--color-ink-900)]"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
