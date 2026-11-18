"use client";

import { CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { DueCard, Topic } from "@/lib/api";

function formatClozeFront(text: string): string {
  return text.replace(/\{\{c\d+::(.*?)\}\}/g, "[ ... ]");
}

function formatClozeAnswer(text: string): string {
  return text.replace(/\{\{c\d+::(.*?)\}\}/g, "$1");
}

interface FlashcardsViewProps {
  cards: DueCard[];
  allUpcomingCards: DueCard[];
  activeTopics: Topic[];
  originFilter: "ALL" | "FEYNMAN_GAP" | "SYNTHESIZER" | "MOCK_EXAM";
  onOriginFilterChange: (v: "ALL" | "FEYNMAN_GAP" | "SYNTHESIZER" | "MOCK_EXAM") => void;
  topicFilter: string;
  onTopicFilterChange: (v: string) => void;
  includeUpcoming: boolean;
  onIncludeUpcomingChange: (v: boolean) => void;
  cardIdx: number;
  onCardIdxChange: (v: number) => void;
  revealed: boolean;
  onRevealedChange: (v: boolean) => void;
  examAnswerDraft: string;
  onExamAnswerDraftChange: (v: string) => void;
  onRateCard: (rating: 1 | 2 | 3 | 4) => void;
}

export function FlashcardsView({
  cards,
  allUpcomingCards,
  activeTopics,
  originFilter,
  onOriginFilterChange,
  topicFilter,
  onTopicFilterChange,
  includeUpcoming,
  onIncludeUpcomingChange,
  cardIdx,
  onCardIdxChange,
  revealed,
  onRevealedChange,
  examAnswerDraft,
  onExamAnswerDraftChange,
  onRateCard,
}: FlashcardsViewProps) {
  const { lang, t } = useLanguage();
  const te = t.exam;
  const isEn = lang === "en";

  const filteredCards = cards.filter((c) => {
    if (originFilter !== "ALL" && c.origin !== originFilter) return false;
    if (topicFilter !== "ALL" && c.topic_id !== topicFilter) return false;
    return true;
  });

  const safeCardIdx = Math.min(cardIdx, Math.max(0, filteredCards.length - 1));
  const currentCard = filteredCards[safeCardIdx];

  const deckCountByTopic: Record<string, number> = {};
  for (const c of allUpcomingCards) {
    deckCountByTopic[c.topic_id] = (deckCountByTopic[c.topic_id] || 0) + 1;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="inline-flex rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-1">
            {(
              [
                ["ALL", te.filterAll],
                ["FEYNMAN_GAP", te.filterFeynman],
                ["MOCK_EXAM", te.filterMock],
                ["SYNTHESIZER", te.filterNotes],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => {
                  onOriginFilterChange(val);
                  onCardIdxChange(0);
                  onRevealedChange(false);
                  onExamAnswerDraftChange("");
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  originFilter === val
                    ? "bg-[var(--color-gold-100)] text-[var(--color-gold-800)]"
                    : "text-ink-600 hover:text-[var(--color-ink-900)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-ink-600">
            <input
              type="checkbox"
              checked={includeUpcoming}
              onChange={(e) => onIncludeUpcomingChange(e.target.checked)}
            />
            {te.includeUpcoming}
          </label>
        </div>

        {!currentCard ? (
          <div className="card-surface p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-ok)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold text-[var(--color-ink-900)]">
              {cards.length > 0 && (originFilter !== "ALL" || topicFilter !== "ALL")
                ? te.noCardsInFilter
                : te.allCaughtUp}
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              {cards.length > 0 && (originFilter !== "ALL" || topicFilter !== "ALL")
                ? te.removeFiltersHint
                : te.fsrsScheduledHint}
            </p>
          </div>
        ) : (
          <div className="card-surface flex min-h-[380px] flex-col justify-between p-8">
            <div>
              <div className="mb-3 flex items-center justify-between text-xs text-ink-500">
                <span className="font-mono font-semibold">
                  {safeCardIdx + 1} / {filteredCards.length}
                </span>
                <span className="rounded-full bg-[var(--color-gold-100)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--color-gold-800)]">
                  {currentCard.type} •{" "}
                  {currentCard.origin === "FEYNMAN_GAP"
                    ? te.filterFeynman
                    : currentCard.origin === "MOCK_EXAM"
                    ? te.filterMock
                    : te.filterNotes}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--color-ink-900)] transition-all"
                  style={{ width: `${((safeCardIdx + 1) / filteredCards.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="my-8 text-center">
              <h3 className="mx-auto max-w-xl text-2xl font-bold leading-snug text-[var(--color-ink-900)]">
                {currentCard.type === "CLOZE"
                  ? formatClozeFront(currentCard.front)
                  : currentCard.front}
              </h3>

              {currentCard.type === "EXAM_Q" && !revealed && (
                <textarea
                  rows={3}
                  value={examAnswerDraft}
                  onChange={(e) => onExamAnswerDraftChange(e.target.value)}
                  placeholder={te.draftAnswerPlaceholder}
                  className="mx-auto mt-5 w-full max-w-lg rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] p-3 text-left text-sm focus:border-[var(--color-gold-700)] focus:bg-[var(--color-paper)]"
                />
              )}

              {revealed && (
                <div className="mx-auto mt-6 max-w-xl space-y-3 rounded-2xl border border-[var(--color-gold-200)] bg-[var(--color-gold-100)] p-4 text-left text-sm text-ink-700">
                  {examAnswerDraft.trim() && (
                    <p className="border-b border-[var(--color-gold-200)] pb-2 text-xs text-ink-500">
                      <strong>{te.yourAnswer}</strong> {examAnswerDraft}
                    </p>
                  )}
                  <p className="leading-relaxed">
                    {currentCard.type === "CLOZE"
                      ? formatClozeAnswer(currentCard.back)
                      : currentCard.back}
                  </p>
                </div>
              )}
            </div>

            {!revealed ? (
              <div className="text-center">
                <button
                  data-testid="flashcard-reveal"
                  onClick={() => onRevealedChange(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-ink-900)] px-6 py-2.5 text-xs font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-900)]"
                >
                  {te.showAnswer}
                  <kbd className="rounded bg-[var(--color-paper)]/15 px-1.5 py-0.5 font-mono text-[10px]">
                    {te.spaceKey}
                  </kbd>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2.5 text-xs">
                {(
                  [
                    [1, te.ratingLabels[0], "border-[var(--color-danger)] bg-[var(--color-danger-soft)]/70 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"],
                    [2, te.ratingLabels[1], "border-[var(--color-warn)] bg-[var(--color-warn-soft)]/70 text-[var(--color-warn)] hover:bg-[var(--color-warn-soft)]"],
                    [3, te.ratingLabels[2], "border-[var(--color-ok)] bg-[var(--color-ok-soft)]/70 text-[var(--color-ok)] hover:bg-[var(--color-ok-soft)]"],
                    [4, te.ratingLabels[3], "border-[var(--color-gold-200)] bg-[var(--color-gold-100)]/70 text-[var(--color-gold-800)] hover:bg-[var(--color-gold-100)]"],
                  ] as const
                ).map(([rating, label, cls]) => (
                  <button
                    key={rating}
                    data-testid={`flashcard-rate-${rating}`}
                    onClick={() => onRateCard(rating)}
                    className={`flex flex-col items-center rounded-xl border py-2.5 transition ${cls}`}
                  >
                    <span className="font-bold">
                      {rating}. {label}
                    </span>
                    <span className="font-mono text-[10px] opacity-80">
                      {currentCard.previews?.[String(rating)] || "-"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4 lg:col-span-4">
        <div className="card-surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
            {isEn ? "Due today" : "Oggi"}
          </p>
          <div className="font-mono mt-1 text-3xl font-extrabold text-[var(--color-ink-900)]">
            {cards.length}
          </div>
          <p className="text-xs text-ink-500">
            {isEn ? "cards due before exam" : "in scadenza prima dell'esame"}
          </p>
        </div>

        <div className="card-surface p-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-ink-500">
            {isEn ? "Decks by topic" : "Mazzi per argomento"}
          </p>
          <div className="space-y-1 text-xs">
            <button
              type="button"
              onClick={() => {
                onTopicFilterChange("ALL");
                onCardIdxChange(0);
                onRevealedChange(false);
              }}
              className={`flex w-full justify-between rounded-lg px-2.5 py-2 transition ${
                topicFilter === "ALL"
                  ? "bg-[var(--color-gold-100)] font-bold text-[var(--color-gold-800)]"
                  : "text-ink-700 hover:bg-[var(--color-sunken)]"
              }`}
            >
              <span>{te.allTopics}</span>
              <span className="font-mono font-bold">{allUpcomingCards.length}</span>
            </button>
            {activeTopics.map((tp) => {
              const cnt = deckCountByTopic[tp.id] || 0;
              return (
                <button
                  key={tp.id}
                  type="button"
                  onClick={() => {
                    onTopicFilterChange(tp.id);
                    onCardIdxChange(0);
                    onRevealedChange(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                    topicFilter === tp.id
                      ? "bg-[var(--color-gold-100)] font-bold text-[var(--color-gold-800)]"
                      : "text-ink-700 hover:bg-[var(--color-sunken)]"
                  }`}
                >
                  <span className="truncate">{tp.title}</span>
                  <span className="font-mono shrink-0 font-bold text-ink-500">{cnt}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
