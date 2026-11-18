"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

interface CourseContextCardProps {
  /** Sintesi del contesto del corso, assente se la ricerca web era spenta. */
  summary: string | null | undefined;
}

/** Il contesto del corso trovato in rete, richiudibile perché è lungo. */
export function CourseContextCard({ summary }: CourseContextCardProps) {
  const { t } = useLanguage();
  const te = t.exam;
  const [expanded, setExpanded] = useState(false);

  if (!summary) return null;

  return (
    <div className="card-surface px-4 py-3 text-xs text-ink-700">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between font-semibold text-[var(--color-ink-900)]"
      >
        <span className="inline-flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-[var(--color-gold-800)]" /> {te.courseContext}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />
        )}
      </button>
      {expanded && <p className="mt-2 leading-relaxed text-ink-600">{summary}</p>}
    </div>
  );
}
