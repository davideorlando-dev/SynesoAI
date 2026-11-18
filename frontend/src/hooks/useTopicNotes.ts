"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { synthesizeTopicStream, updateTopicNotes } from "@/lib/api";

interface UseTopicNotesOptions {
  onError: (message: string) => void;
  /** Called when generated notes are ready, and after an edit is saved. */
  onNotesChanged: (topicId: string) => Promise<void>;
  /** Called when a generation starts, to clear what it supersedes. */
  onSynthesisStarted?: () => void;
}

/**
 * Notes of a topic: the generation streamed token by token, and the editor
 * used to correct the result.
 *
 * Only one generation runs at a time: starting another, leaving the page or
 * calling abortAndReset stops the one in flight.
 */
export function useTopicNotes({
  onError,
  onNotesChanged,
  onSynthesisStarted,
}: UseTopicNotesOptions) {
  const { lang, t } = useLanguage();
  const errorMessage = useErrorMessage();

  const [synthesizing, setSynthesizing] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  const onNotesChangedRef = useRef(onNotesChanged);
  const onSynthesisStartedRef = useRef(onSynthesisStarted);
  useEffect(() => {
    onErrorRef.current = onError;
    onNotesChangedRef.current = onNotesChanged;
    onSynthesisStartedRef.current = onSynthesisStarted;
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    setSynthesizing(false);
    setStreamingText("");
    setPhase(null);
    setEditing(false);
  }, []);

  /** Stops the generation in flight, if any, and clears the screen. */
  const abortAndReset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    reset();
  }, [reset]);

  const startEditing = useCallback((markdown: string) => {
    setDraft(markdown);
    setEditing(true);
  }, []);

  const stopEditing = useCallback(() => setEditing(false), []);

  /**
   * Generates the notes of a topic, streaming them as they arrive.
   * With `force` the existing notes are replaced, after confirmation.
   */
  async function synthesize(topicId: string, hasNotes: boolean, force = false) {
    if (force && hasNotes && !window.confirm(t.exam.regenConfirm)) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSynthesizing(true);
    setEditing(false);
    setStreamingText("");
    setPhase(t.exam.streamingDefaultPhase);
    onSynthesisStartedRef.current?.();

    try {
      await synthesizeTopicStream(
        topicId,
        force,
        {
          onToken: (text) => setStreamingText((prev) => prev + text),
          onPhase: setPhase,
          onDone: () => onNotesChangedRef.current(topicId),
        },
        controller.signal,
        lang
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onErrorRef.current(errorMessage(err));
    } finally {
      // Una generazione più recente ha già preso il posto di questa: non tocca
      // a quella interrotta ripulire lo schermo.
      if (abortRef.current === controller) {
        setSynthesizing(false);
        setStreamingText("");
        setPhase(null);
        abortRef.current = null;
      }
    }
  }

  async function saveEdits(topicId: string) {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await updateTopicNotes(topicId, draft);
      setEditing(false);
      await onNotesChangedRef.current(topicId);
    } catch (err) {
      onErrorRef.current(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return {
    synthesizing,
    streamingText,
    phase,
    editing,
    draft,
    setDraft,
    saving,
    synthesize,
    saveEdits,
    startEditing,
    stopEditing,
    abortAndReset,
  };
}

/** Quel che il riquadro degli appunti riceve da useTopicNotes. */
export type TopicNotesController = ReturnType<typeof useTopicNotes>;
