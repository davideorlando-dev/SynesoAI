"use client";

import Link from "next/link";
import { useLanguage } from "@/components/LanguageProvider";
import { SynesoSymbol } from "@/components/SynesoLogo";

/** Un indirizzo che non esiste: succede coi collegamenti vecchi. */
export default function NotFound() {
  const { t } = useLanguage();
  const tc = t.crash;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] p-6">
      <div className="card-surface max-w-lg p-8">
        <SynesoSymbol className="h-8 w-8" />
        <h1 className="mt-5 font-title text-[27px] leading-tight text-[var(--color-ink-900)]">
          {tc.notFoundTitle}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">{tc.notFoundBody}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-card bg-[var(--color-ink-900)] px-5 py-3 text-sm font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-800)]"
        >
          {tc.home}
        </Link>
      </div>
    </main>
  );
}
