"use client";

import { Award, Clock, Loader2, Mic, RotateCcw, Square } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { MockExamHistoryItem, MockExamResult, MockQuestion } from "@/lib/api";

function formatTimer(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface MockExamViewProps {
  mockQuestions: MockQuestion[];
  mockAnswers: Record<string, string>;
  onMockAnswerChange: (qid: string, val: string) => void;
  mockResult: MockExamResult | null;
  mockHistory: MockExamHistoryItem[];
  generatingMock: boolean;
  gradingMock: boolean;
  mockElapsedSec: number;
  mockCountConfig: number;
  onMockCountChange: (v: number) => void;
  mockFocusConfig: "ALL" | "CORE" | "WEAK";
  onMockFocusChange: (v: "ALL" | "CORE" | "WEAK") => void;
  showMockTimer: boolean;
  onShowMockTimerChange: (v: boolean) => void;
  onStartMock: () => void;
  onSubmitMock: (e: React.FormEvent) => void;
  onCancelMock: () => void;
  onResetToHistory: () => void;
  onOpenHistoryItem: (item: MockExamHistoryItem) => void;
  recordingTarget: string | null;
  recordingSeconds: number;
  transcribingTarget: string | null;
  onToggleVoice: (target: string) => void;
}

export function MockExamView({
  mockQuestions,
  mockAnswers,
  onMockAnswerChange,
  mockResult,
  mockHistory,
  generatingMock,
  gradingMock,
  mockElapsedSec,
  mockCountConfig,
  onMockCountChange,
  mockFocusConfig,
  onMockFocusChange,
  showMockTimer,
  onShowMockTimerChange,
  onStartMock,
  onSubmitMock,
  onCancelMock,
  onResetToHistory,
  onOpenHistoryItem,
  recordingTarget,
  recordingSeconds,
  transcribingTarget,
  onToggleVoice,
}: MockExamViewProps) {
  const { lang, t } = useLanguage();
  const te = t.exam;
  const isEn = lang === "en";

  const answeredMockCount = mockQuestions.filter(
    (q) => (mockAnswers[q.id] || "").trim().length > 0
  ).length;

  return (
    <div className="space-y-5">
      {mockQuestions.length === 0 ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="card-surface p-6 lg:col-span-6">
            <h3 className="mb-4 text-sm font-bold text-[var(--color-ink-900)]">
              {isEn ? "Configure mock exam" : "Configura prova"}
            </h3>
            <div className="divide-y divide-[var(--color-line)] text-xs">
              <div className="flex items-center justify-between py-3">
                <span className="text-ink-500">{isEn ? "Format" : "Modalità"}</span>
                <span className="font-semibold">
                  {isEn ? "Written + voice" : "Scritto + orale (voce)"}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-ink-500">{isEn ? "Questions" : "Numero domande"}</span>
                <select
                  value={mockCountConfig}
                  onChange={(e) => onMockCountChange(Number(e.target.value))}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 font-semibold"
                >
                  <option value={3}>3</option>
                  <option value={6}>6</option>
                  <option value={10}>10</option>
                </select>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-ink-500">{isEn ? "Topic focus" : "Focus argomenti"}</span>
                <select
                  value={mockFocusConfig}
                  onChange={(e) => onMockFocusChange(e.target.value as "ALL" | "CORE" | "WEAK")}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 font-semibold"
                >
                  <option value="ALL">
                    {isEn ? "All (CORE priority)" : "Tutti (priorità CORE)"}
                  </option>
                  <option value="CORE">{isEn ? "CORE only" : "Solo CORE"}</option>
                  <option value="WEAK">{isEn ? "Weakest topics" : "Argomenti più deboli"}</option>
                </select>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-ink-500">
                  {isEn ? "Visible timer" : "Cronometro visibile"}
                </span>
                <input
                  type="checkbox"
                  checked={showMockTimer}
                  onChange={(e) => onShowMockTimerChange(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-ink-900)]"
                />
              </div>
            </div>
            <button
              onClick={onStartMock}
              data-testid="mock-start"
              disabled={generatingMock}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-ink-900)] py-2.5 text-xs font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-900)] disabled:opacity-50"
            >
              {generatingMock ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {te.mockGenerating}
                </>
              ) : (
                <>
                  <span>▶️</span>
                  <span>
                    {isEn
                      ? `Start Simulation (${mockCountConfig})`
                      : `Avvia simulazione (${mockCountConfig} domande)`}
                  </span>
                </>
              )}
            </button>
          </div>

          <div className="card-surface p-6 lg:col-span-6">
            <h3 className="mb-4 text-sm font-bold text-[var(--color-ink-900)]">{te.mockHistoryTitle}</h3>
            {mockHistory.length === 0 ? (
              <p className="text-xs text-ink-500">
                {isEn
                  ? "No simulations completed yet."
                  : "Nessuna simulazione completata finora."}
              </p>
            ) : (
              <div className="space-y-2">
                {mockHistory.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => onOpenHistoryItem(item)}
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--color-line)]/80 bg-[var(--color-sunken)] px-4 py-3 text-left text-xs transition hover:border-[var(--color-gold-200)]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono rounded-md px-2 py-0.5 font-bold ${
                          item.passed
                            ? "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                            : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                        }`}
                      >
                        {item.score_30}/30
                      </span>
                      <span className="line-clamp-1 font-medium text-ink-700">
                        {isEn ? "Attempt" : "Simulazione"} #{mockHistory.length - idx} •{" "}
                        {item.overall_feedback}
                      </span>
                    </div>
                    <span className="font-mono shrink-0 text-[10px] text-ink-500">
                      {new Date(item.created_at).toLocaleDateString(
                        lang === "en" ? "en-US" : "it-IT"
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : mockResult ? (
        <div className="space-y-6">
          <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                {te.mockOutcome}
              </p>
              <div className="mt-1 flex items-baseline gap-3">
                <span
                  data-testid="mock-score"
                  data-score={mockResult.score_30}
                  data-passed={String(mockResult.passed)}
                  className="font-mono text-4xl font-extrabold text-[var(--color-ink-900)]"
                >
                  {mockResult.score_30}
                  <span className="text-lg font-medium text-ink-500"> / 30</span>
                </span>
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                    mockResult.passed
                      ? "border border-[var(--color-ok)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                      : "border border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                  }`}
                >
                  {mockResult.passed ? te.mockPassed : te.mockFailed}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-600">
                {mockResult.overall_feedback}
              </p>
              {mockResult.added_cards_count > 0 && (
                <p className="mt-2 text-xs font-semibold text-[var(--color-gold-800)]">
                  {te.mockGapCardsPrefix} {mockResult.added_cards_count} {te.mockGapCardsSuffix}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onResetToHistory}
                className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3.5 py-2 text-xs font-semibold text-ink-700 hover:bg-[var(--color-sunken)]"
              >
                {te.backToHistory}
              </button>
              <button
                onClick={onStartMock}
                disabled={generatingMock}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-ink-900)] px-4 py-2 text-xs font-semibold text-[var(--color-canvas)] hover:bg-[var(--color-ink-900)]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {te.newSimulation}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {mockQuestions.map((q) => {
              const fb = mockResult.question_feedback.find((f) => f.question_id === q.id);
              return (
                <div key={q.id} className="card-surface p-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="rounded bg-[var(--color-sunken)] px-2 py-0.5 text-[10px] font-bold text-ink-600">
                      {q.id} • {q.topic_title}
                    </span>
                    {fb && (
                      <span className="font-mono text-xs font-bold text-[var(--color-gold-800)]">
                        {fb.score} / {fb.max_score} {te.ptsSuffix}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-[var(--color-ink-900)]">{q.question}</h3>
                  <p className="mt-2 rounded-xl bg-[var(--color-sunken)] p-3 text-xs text-ink-700">
                    <strong className="text-ink-500">{te.yourAnswer} </strong>
                    {mockAnswers[q.id]?.trim() || te.noAnswerProvided}
                  </p>

                  {fb && (
                    <div className="mt-3 space-y-2 text-xs">
                      {fb.missing.length > 0 && (
                        <div className="rounded-xl border border-[var(--color-danger)]/70 bg-[var(--color-danger-soft)]/50 p-2.5 text-[var(--color-danger)]">
                          <strong>{te.missingPoints}</strong> {fb.missing.join(" • ")}
                        </div>
                      )}
                      <div className="rounded-xl border border-[var(--color-ok)]/70 bg-[var(--color-ok-soft)]/40 p-2.5 text-ink-700">
                        <strong className="text-[var(--color-ok)]">{te.modelAnswer} </strong>
                        {fb.model_answer}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmitMock} className="space-y-5">
          <div className="card-surface sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-[var(--color-ink-900)]">
                {te.examInProgress} ({answeredMockCount}/{mockQuestions.length}{" "}
                {te.answersCountSuffix})
              </h2>
              <p className="text-[11px] text-ink-500">{te.mockInProgressSub}</p>
            </div>
            <div className="flex items-center gap-2.5">
              {showMockTimer && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] px-2.5 py-1 font-mono text-xs font-semibold text-ink-700">
                  <Clock className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />
                  {formatTimer(mockElapsedSec)}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  const hasDraft = Object.values(mockAnswers).some((v) => v.trim().length > 0);
                  if (hasDraft && !window.confirm(te.cancelMockConfirm)) return;
                  onCancelMock();
                }}
                className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-[var(--color-sunken)]"
              >
                {te.cancel}
              </button>
            </div>
          </div>

          {mockQuestions.map((q, idx) => {
            const targetKey = `MOCK:${q.id}`;
            const isRecHere = recordingTarget === targetKey;
            const isTransHere = transcribingTarget === targetKey;
            return (
              <div key={q.id} className="card-surface p-5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="rounded bg-[var(--color-gold-100)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-gold-800)]">
                    {te.questionLabel} {idx + 1} • {q.topic_title}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-ink-500">
                    {te.maxPtsPrefix} {q.max_points} {te.ptsSuffix}
                  </span>
                </div>
                <p className="mb-3 text-sm font-semibold text-[var(--color-ink-900)]">{q.question}</p>
                <textarea
                  rows={4}
                  data-testid="mock-answer"
                  data-question={q.id}
                  value={mockAnswers[q.id] || ""}
                  onChange={(e) => onMockAnswerChange(q.id, e.target.value)}
                  placeholder={isTransHere ? te.transcribingPlaceholder : te.answerPlaceholder}
                  className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] p-3 text-sm focus:border-[var(--color-gold-700)] focus:bg-[var(--color-paper)]"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onToggleVoice(targetKey)}
                    disabled={
                      isTransHere || gradingMock || (recordingTarget !== null && !isRecHere)
                    }
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition ${
                      isRecHere
                        ? "animate-pulse border-[var(--color-danger-fill)] bg-[var(--color-danger-fill)] text-white"
                        : "border-[var(--color-line)] bg-[var(--color-paper)] text-ink-700 hover:bg-[var(--color-sunken)]"
                    } disabled:opacity-50`}
                  >
                    {isTransHere ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--color-gold-800)]" />
                        {te.transcribingBtn}
                      </>
                    ) : isRecHere ? (
                      <>
                        <Square className="h-2.5 w-2.5 fill-current" />
                        {te.stopBtn} ({recordingSeconds}s)
                      </>
                    ) : (
                      <>
                        <Mic className="h-3 w-3 text-[var(--color-gold-800)]" />
                        {te.answerByVoice}
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="submit"
            data-testid="mock-submit"
            disabled={gradingMock || recordingTarget !== null || transcribingTarget !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-ink-900)] py-3 text-sm font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-900)] disabled:opacity-50"
          >
            {gradingMock ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {te.gradingMock}
              </>
            ) : (
              <>
                <Award className="h-4 w-4" /> {te.submitMock}
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
