"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { SynesoSymbol } from "@/components/SynesoLogo";

/**
 * Quando una pagina non riesce a disegnarsi.
 *
 * Senza questo file l'utente vedrebbe uno schermo bianco: nessun messaggio,
 * nessun modo di tornare indietro, e il dubbio di aver perso il lavoro. La
 * prima cosa che dice, quindi, è che i dati sono salvi — perché lo sono
 * davvero: stanno in un file SQLite sul suo computer, non in questa pagina.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();
  const tc = t.crash;

  useEffect(() => {
    // Il log del browser è l'unico posto dove questo errore esiste ancora.
    console.error("[syneso] errore non gestito nell'interfaccia", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] p-6">
      <div className="card-surface max-w-lg p-8">
        <SynesoSymbol className="h-8 w-8" />
        <h1 className="mt-5 font-title text-[27px] leading-tight text-[var(--color-ink-900)]">
          {tc.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">{tc.body}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-card bg-[var(--color-ink-900)] px-5 py-3 text-sm font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-800)]"
          >
            <RotateCcw className="h-4 w-4" />
            {tc.retry}
          </button>
          <Link
            href="/"
            className="text-sm font-semibold text-ink-700 underline underline-offset-4 transition hover:text-[var(--color-ink-900)]"
          >
            {tc.home}
          </Link>
        </div>

        <p className="mt-6 border-t border-[var(--color-line)] pt-4 text-[11px] text-ink-500">
          {tc.logHint}
          {error.digest && <span className="ml-1 font-mono">({error.digest})</span>}
        </p>
      </div>
    </main>
  );
}
