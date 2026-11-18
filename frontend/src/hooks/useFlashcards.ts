"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import {
  createCardFromText,
  DueCard,
  generateMoreCards,
  getDueCards,
  reviewCard,
} from "@/lib/api";

export type CardOriginFilter = "ALL" | "FEYNMAN_GAP" | "SYNTHESIZER" | "MOCK_EXAM";

const EXTRA_CARDS_BATCH = 5;

interface UseFlashcardsOptions {
  examId: string;
  /** Keyboard shortcuts only work while the flashcards section is visible. */
  shortcutsActive: boolean;
  onError: (message: string) => void;
  /** Called after a review, to refresh the data it changed elsewhere. */
  onReviewed: () => Promise<void>;
}

/**
 * Review queue of an exam: the cards, the filters, the card on screen and the
 * actions that change the deck (review, generate more, create from a selection).
 *
 * `cards` is the queue being reviewed and `deck` every card of the exam; with
 * "include upcoming" switched on the two coincide.
 */
export function useFlashcards({
  examId,
  shortcutsActive,
  onError,
  onReviewed,
}: UseFlashcardsOptions) {
  const { lang, t } = useLanguage();
  const errorMessage = useErrorMessage();

  const [cards, setCards] = useState<DueCard[]>([]);
  const [deck, setDeck] = useState<DueCard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [examAnswerDraft, setExamAnswerDraft] = useState("");
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const [originFilter, setOriginFilter] = useState<CardOriginFilter>("ALL");
  const [topicFilter, setTopicFilter] = useState<string>("ALL");
  const [generatingExtra, setGeneratingExtra] = useState(false);
  const [creatingFromSelection, setCreatingFromSelection] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const onErrorRef = useRef(onError);
  const onReviewedRef = useRef(onReviewed);
  useEffect(() => {
    onErrorRef.current = onError;
    onReviewedRef.current = onReviewed;
  });

  const fetchCards = useCallback(
    async (upcoming: boolean): Promise<[DueCard[], DueCard[]] | null> => {
      try {
        return await Promise.all([
          getDueCards(examId, upcoming, lang),
          getDueCards(examId, true, lang),
        ]);
      } catch (err) {
        onErrorRef.current(errorMessage(err));
        return null;
      }
    },
    [examId, lang, errorMessage]
  );

  const showQueue = useCallback((queue: DueCard[], fullDeck: DueCard[]) => {
    setCards(queue);
    setDeck(fullDeck);
    setCardIdx(0);
    setRevealed(false);
    setExamAnswerDraft("");
  }, []);

  const reload = useCallback(async () => {
    const loaded = await fetchCards(includeUpcoming);
    if (loaded) showQueue(loaded[0], loaded[1]);
  }, [fetchCards, includeUpcoming, showQueue]);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    // Differito: la prima resa della pagina non attende le carte.
    const timer = setTimeout(async () => {
      const loaded = await fetchCards(includeUpcoming);
      if (!cancelled && loaded) showQueue(loaded[0], loaded[1]);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [examId, includeUpcoming, fetchCards, showQueue]);

  const filteredCards = cards.filter((card) => {
    if (originFilter !== "ALL" && card.origin !== originFilter) return false;
    if (topicFilter !== "ALL" && card.topic_id !== topicFilter) return false;
    return true;
  });
  const filteredCount = filteredCards.length;
  const safeCardIdx = Math.min(cardIdx, Math.max(0, filteredCount - 1));
  const currentCard = filteredCards[safeCardIdx];

  /** Records a review and moves on; reloads the queue once it is exhausted. */
  async function rate(rating: 1 | 2 | 3 | 4) {
    if (!currentCard) return;
    try {
      await reviewCard(currentCard.id, rating);
      setRevealed(false);
      setExamAnswerDraft("");
      if (safeCardIdx + 1 < filteredCount) {
        setCardIdx(safeCardIdx + 1);
        return;
      }
      await reload();
      await onReviewedRef.current();
    } catch (err) {
      onErrorRef.current(errorMessage(err));
    }
  }

  const rateRef = useRef(rate);
  useEffect(() => {
    rateRef.current = rate;
  });

  useEffect(() => {
    if (!shortcutsActive || !currentCard) return;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;

      if (e.code === "Space" && !revealed) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void rateRef.current(Number(e.key) as 1 | 2 | 3 | 4);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcutsActive, currentCard, revealed]);

  const clearNotice = useCallback(() => setNotice(null), []);

  async function generateMore(topicId: string) {
    setGeneratingExtra(true);
    setNotice(null);
    try {
      const res = await generateMoreCards(topicId, EXTRA_CARDS_BATCH);
      await reload();
      setNotice(t.exam.cardsAddedNotice(res.added_count));
    } catch (err) {
      onErrorRef.current(errorMessage(err));
    } finally {
      setGeneratingExtra(false);
    }
  }

  async function createFromText(topicId: string, text: string) {
    setCreatingFromSelection(true);
    setNotice(null);
    try {
      const res = await createCardFromText(topicId, text);
      await reload();
      setNotice(t.exam.selectionCardCreated(res.card.front));
    } catch (err) {
      onErrorRef.current(errorMessage(err));
    } finally {
      setCreatingFromSelection(false);
    }
  }

  return {
    cards,
    deck,
    filteredCards,
    currentCard,
    cardIdx: safeCardIdx,
    setCardIdx,
    revealed,
    setRevealed,
    examAnswerDraft,
    setExamAnswerDraft,
    includeUpcoming,
    setIncludeUpcoming,
    originFilter,
    setOriginFilter,
    topicFilter,
    setTopicFilter,
    notice,
    clearNotice,
    generatingExtra,
    creatingFromSelection,
    reload,
    rate,
    generateMore,
    createFromText,
  };
}

/** Quel che le viste ricevono da useFlashcards. */
export type FlashcardsController = ReturnType<typeof useFlashcards>;
