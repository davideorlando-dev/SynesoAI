"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import {
  FeynmanResponse,
  getFeynmanHistory,
  saveFeynmanDraft,
  submitFeynman,
} from "@/lib/api";

/** Below this an explanation is too short to be worth evaluating. */
const MIN_EXPLANATION_CHARS = 5;
const DRAFT_NOTICE_MS = 2000;

interface UseFeynmanOptions {
  onError: (message: string) => void;
  /** Called after an evaluation, to refresh the data it changed. */
  onEvaluated: (topicId: string) => Promise<void>;
}

/**
 * Feynman section: the explanation being written, its saved draft, the
 * evaluation on screen and the session it belongs to.
 *
 * The topic is passed to each action instead of being held here, because the
 * selected topic belongs to the page and is shared with the other sections.
 */
export function useFeynman({ onError, onEvaluated }: UseFeynmanOptions) {
  const errorMessage = useErrorMessage();

  const [explanation, setExplanation] = useState("");
  const [result, setResult] = useState<FeynmanResponse | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [draftSavedNotice, setDraftSavedNotice] = useState(false);

  const onErrorRef = useRef(onError);
  const onEvaluatedRef = useRef(onEvaluated);
  useEffect(() => {
    onErrorRef.current = onError;
    onEvaluatedRef.current = onEvaluated;
  });

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  /** Loads the last evaluation of a topic and the draft left unsent. */
  const loadForTopic = useCallback(async (topicId: string) => {
    const { session, draft } = await getFeynmanHistory(topicId);
    setResult(session);
    setActiveSessionId(session ? session.session_id : null);
    setExplanation(draft);
    setDraftSavedNotice(false);
  }, []);

  /** Appends dictated text to the explanation, separated by a space. */
  const appendToExplanation = useCallback((text: string) => {
    setExplanation((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
  }, []);

  /** Starts a new session on the same topic, clearing what is on screen. */
  const resetSession = useCallback(() => {
    setActiveSessionId(null);
    setResult(null);
    setExplanation("");
  }, []);

  async function saveDraft(topicId: string) {
    try {
      await saveFeynmanDraft(topicId, explanation);
      setDraftSavedNotice(true);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setDraftSavedNotice(false), DRAFT_NOTICE_MS);
    } catch (err) {
      onErrorRef.current(errorMessage(err));
    }
  }

  async function submit(topicId: string) {
    if (explanation.trim().length < MIN_EXPLANATION_CHARS) return;
    setEvaluating(true);
    try {
      const res = await submitFeynman(topicId, explanation, activeSessionId);
      setResult(res);
      setActiveSessionId(res.session_id);
      setExplanation("");
      await onEvaluatedRef.current(topicId);
    } catch (err) {
      onErrorRef.current(errorMessage(err));
    } finally {
      setEvaluating(false);
    }
  }

  return {
    explanation,
    setExplanation,
    appendToExplanation,
    result,
    activeSessionId,
    evaluating,
    draftSavedNotice,
    loadForTopic,
    saveDraft,
    submit,
    resetSession,
  };
}
