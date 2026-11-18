"use client";

import { useCallback, useEffect, useState } from "react";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import {
  generateMockExam,
  getMockHistory,
  gradeMockExam,
  MockExamHistoryItem,
  MockExamResult,
  MockQuestion,
} from "@/lib/api";

export type MockFocus = "ALL" | "CORE" | "WEAK";

const DEFAULT_QUESTION_COUNT = 6;

interface UseMockExamOptions {
  examId: string;
  /** The timer only runs while the mock exam is the visible section. */
  timerActive: boolean;
  /** Receives an error message to show, or null to clear the current one. */
  onError: (message: string | null) => void;
  /** Called after a mock exam has been graded, to refresh data it changed. */
  onGraded: () => Promise<void>;
}

/**
 * State and actions of the mock exam section: configuration, the session in
 * progress (questions, answers, timer), its result and the history.
 */
export function useMockExam({ examId, timerActive, onError, onGraded }: UseMockExamOptions) {
  const errorMessage = useErrorMessage();

  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<MockExamResult | null>(null);
  const [history, setHistory] = useState<MockExamHistoryItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [grading, setGrading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [countConfig, setCountConfig] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [focusConfig, setFocusConfig] = useState<MockFocus>("ALL");
  const [showTimer, setShowTimer] = useState<boolean>(true);

  const sessionInProgress = questions.length > 0 && result === null;

  useEffect(() => {
    if (!timerActive || !sessionInProgress) return;
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [timerActive, sessionInProgress]);

  const reloadHistory = useCallback(async () => {
    setHistory(await getMockHistory(examId));
  }, [examId]);

  /** Drops the session in progress and its result (e.g. when the exam changes). */
  const resetSession = useCallback(() => {
    setQuestions([]);
    setAnswers({});
    setResult(null);
  }, []);

  const setAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  /** Appends dictated text to an answer, separated by a space. */
  const appendToAnswer = useCallback((questionId: string, text: string) => {
    setAnswers((prev) => {
      const current = (prev[questionId] || "").trim();
      return { ...prev, [questionId]: current ? `${current} ${text}` : text };
    });
  }, []);

  async function start() {
    setGenerating(true);
    onError(null);
    setResult(null);
    setAnswers({});
    setElapsedSec(0);
    try {
      const res = await generateMockExam(examId, countConfig, focusConfig);
      setQuestions(res.questions);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function submit() {
    if (questions.length === 0) return;
    setGrading(true);
    onError(null);
    try {
      setResult(await gradeMockExam(examId, questions, answers));
      await onGraded();
      await reloadHistory();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setGrading(false);
    }
  }

  /** Abandons the questions in progress, keeping any result on screen. */
  function cancel() {
    setQuestions([]);
    setAnswers({});
  }

  function openHistoryItem(item: MockExamHistoryItem) {
    setQuestions(item.questions);
    setAnswers(item.answers);
    setResult({
      score_30: item.score_30,
      passed: item.passed,
      overall_feedback: item.overall_feedback,
      question_feedback: item.feedback,
      added_cards_count: 0,
    });
  }

  return {
    questions,
    answers,
    result,
    history,
    generating,
    grading,
    elapsedSec,
    countConfig,
    setCountConfig,
    focusConfig,
    setFocusConfig,
    showTimer,
    setShowTimer,
    setAnswer,
    appendToAnswer,
    start,
    submit,
    cancel,
    resetSession,
    reloadHistory,
    openHistoryItem,
  };
}
