"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useLanguage } from "@/components/LanguageProvider";
import { searchExam, SearchResultItem } from "@/lib/api";

interface SearchModalProps {
  open: boolean;
  examId: string;
  onClose: () => void;
}

export function SearchModal({ open, examId, onClose }: SearchModalProps) {
  const { t } = useLanguage();
  const ts = t.searchModal;
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2 || !examId) {
      const clearTimer = setTimeout(() => {
        setResults([]);
        setSearching(false);
      }, 0);
      return () => clearTimeout(clearTimer);
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchExam(examId, trimmed);
        setResults(hits);
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [open, query, examId]);

  if (!open) return null;

  function navigateTo(item: SearchResultItem) {
    onClose();
    setQuery("");
    const params = new URLSearchParams({ id: examId, tab: item.tab });
    if (item.topic_id) params.set("topicId", item.topic_id);
    if (item.doc_id) params.set("docId", item.doc_id);
    if (item.page_number) params.set("page", String(item.page_number));
    router.push(`/exam/?${params.toString()}`);
  }

  function quickJump(tab: "STUDY" | "FEYNMAN" | "FLASHCARDS" | "MOCK") {
    onClose();
    setQuery("");
    router.push(`/exam/?id=${encodeURIComponent(examId)}&tab=${tab}`);
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--color-scrim)] px-4 pt-20 backdrop-blur-xs"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ts.placeholder}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
          {searching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-gold-800)]" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-ink-500" />
          )}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ts.placeholder}
            className="flex-1 bg-transparent text-sm text-[var(--color-ink-900)] placeholder:text-ink-500"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-500 hover:bg-[var(--color-sunken)] hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2.5 text-xs">
          {query.trim().length < 2 ? (
            <div className="space-y-1">
              <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                {ts.quickActions}
              </p>
              {[
                ["STUDY", ts.goStudy, <BookOpen key="s" className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />],
                ["FEYNMAN", ts.goFeynman, <MessageSquare key="f" className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />],
                ["FLASHCARDS", ts.goFlashcards, <Layers key="c" className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />],
                ["MOCK", ts.goMock, <GraduationCap key="m" className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />],
              ].map(([tab, label, icon]) => (
                <button
                  key={tab as string}
                  type="button"
                  onClick={() => quickJump(tab as "STUDY" | "FEYNMAN" | "FLASHCARDS" | "MOCK")}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-semibold text-ink-700 transition hover:bg-[var(--color-sunken)]"
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
              <p className="px-2.5 pt-2 text-[11px] text-ink-500">{ts.emptyHint}</p>
            </div>
          ) : results.length === 0 && !searching ? (
            <p className="py-8 text-center text-xs text-ink-500">{ts.noResults}</p>
          ) : (
            <div className="space-y-1">
              {results.map((r, idx) => {
                const badgeLabel =
                  r.type === "topic"
                    ? ts.badgeTopic
                    : r.type === "note"
                    ? ts.badgeNote
                    : r.type === "flashcard"
                    ? ts.badgeCard
                    : ts.badgePdf;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => navigateTo(r)}
                    className="flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--color-sunken)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-bold text-[var(--color-ink-900)]">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--color-gold-800)]" />
                        <span className="truncate">{r.title}</span>
                      </span>
                      <span className="shrink-0 rounded bg-[var(--color-gold-100)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-gold-800)]">
                        {badgeLabel}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-[11px] text-ink-500">{r.snippet}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}