"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import {
  addTopicHighlight,
  clearTutorMessages,
  deleteHighlight,
  getExamAnnotations,
  HighlightColor,
  TutorMessage,
  UserHighlight,
} from "@/lib/api";
import { migrateLegacyAnnotations } from "@/lib/legacyAnnotations";

/**
 * Highlights and tutor conversations of an exam, stored in the database.
 *
 * `topicIds` is null until the exam has been loaded; loading waits for it
 * because the legacy migration needs to know which topics belong to the exam.
 */
export function useExamAnnotations(
  examId: string,
  topicIds: string[] | null,
  onError: (message: string) => void
) {
  const [highlightsByTopic, setHighlightsByTopic] = useState<Record<string, UserHighlight[]>>({});
  const [tutorThreads, setTutorThreads] = useState<Record<string, TutorMessage[]>>({});

  const errorMessage = useErrorMessage();
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const topicKey = topicIds === null ? null : topicIds.join(",");

  useEffect(() => {
    if (!examId || topicKey === null) return;
    let cancelled = false;

    async function load(ids: string[]) {
      try {
        await migrateLegacyAnnotations(examId, ids);
        const annotations = await getExamAnnotations(examId);
        if (cancelled) return;
        setHighlightsByTopic(annotations.highlights);
        setTutorThreads(annotations.tutorThreads);
      } catch (err) {
        if (!cancelled) onErrorRef.current(errorMessage(err));
      }
    }

    void load(topicKey ? topicKey.split(",") : []);
    return () => {
      cancelled = true;
    };
  }, [examId, topicKey, errorMessage]);

  const addHighlight = useCallback(
    async (topicId: string, text: string, color: HighlightColor) => {
      try {
        const saved = await addTopicHighlight(topicId, text, color);
        setHighlightsByTopic((prev) => ({
          ...prev,
          [topicId]: [...(prev[topicId] || []).filter((h) => h.id !== saved.id), saved],
        }));
      } catch (err) {
        onErrorRef.current(errorMessage(err));
      }
    },
    [errorMessage]
  );

  const removeHighlight = useCallback(async (topicId: string, highlightId: string) => {
    try {
      await deleteHighlight(highlightId);
      setHighlightsByTopic((prev) => ({
        ...prev,
        [topicId]: (prev[topicId] || []).filter((h) => h.id !== highlightId),
      }));
    } catch (err) {
      onErrorRef.current(errorMessage(err));
    }
  }, [errorMessage]);

  const appendTutorMessage = useCallback((topicId: string, message: TutorMessage) => {
    setTutorThreads((prev) => ({
      ...prev,
      [topicId]: [...(prev[topicId] || []), message],
    }));
  }, []);

  const clearTutorThread = useCallback(async (topicId: string) => {
    try {
      await clearTutorMessages(topicId);
      setTutorThreads((prev) => ({ ...prev, [topicId]: [] }));
    } catch (err) {
      onErrorRef.current(errorMessage(err));
    }
  }, [errorMessage]);

  return {
    highlightsByTopic,
    tutorThreads,
    addHighlight,
    removeHighlight,
    appendTutorMessage,
    clearTutorThread,
  };
}
