import { Locale, translations } from "@/lib/i18n";

export type ExamMainTab = "STUDY" | "FEYNMAN" | "FLASHCARDS" | "MOCK" | "ANALYTICS";

type SummaryLabels = (typeof translations)[Locale]["exam"]["summaries"];

/** The figures the section summaries are built from. */
export interface ExamSectionStats {
  topicsTotal: number;
  topicsWithNotes: number;
  topicsMastered: number;
  /** Cards in the review queue currently shown. */
  cardsInQueue: number;
  cardsInDeck: number;
  /** True when the queue also includes cards that are not due yet. */
  queueIncludesUpcoming: boolean;
  mocksTaken: number;
  mocksPassed: number;
  estimatedGrade30: number | null;
  retentionPct: number | null;
}

/**
 * One-line summary shown under the page title. Each section reports the
 * figure that matters there, instead of the same counter everywhere.
 */
export function examSectionSummary(
  tab: ExamMainTab,
  stats: ExamSectionStats,
  labels: SummaryLabels
): string {
  switch (tab) {
    case "STUDY":
      return labels.study(stats.topicsWithNotes, stats.topicsTotal);
    case "FEYNMAN":
      return labels.feynman(stats.topicsMastered, stats.topicsTotal);
    case "FLASHCARDS":
      return labels.flashcards(
        stats.cardsInQueue,
        stats.cardsInDeck,
        stats.queueIncludesUpcoming
      );
    case "MOCK":
      return labels.mock(stats.mocksTaken, stats.mocksPassed);
    case "ANALYTICS":
      return labels.analytics(stats.estimatedGrade30, stats.retentionPct);
  }
}
