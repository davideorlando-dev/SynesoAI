"use client";

import { BookOpen, Brain, CheckCircle2, Loader2, Mic, RotateCcw, Square } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { FeynmanResponse, Topic } from "@/lib/api";

interface FeynmanViewProps {
  activeTopics: Topic[];
  selectedTopic: Topic | null;
  onSelectTopic: (topic: Topic) => void;
  explanation: string;
  onExplanationChange: (val: string) => void;
  evaluating: boolean;
  feynmanResult: FeynmanResponse | null;
  activeSessionId: string | null;
  onResetSession: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSaveDraft: () => void;
  draftSavedNotice: boolean;
  recordingTarget: string | null;
  recordingSeconds: number;
  transcribingTarget: string | null;
  onToggleVoice: (target: string) => void;
  onOpenPdfAt: (docId: string | null | undefined, page: number) => void;
  onGoToNotes: () => void;
}

export function FeynmanView({
  activeTopics,
  selectedTopic,
  onSelectTopic,
  explanation,
  onExplanationChange,
  evaluating,
  feynmanResult,
  activeSessionId,
  onResetSession,
  onSubmit,
  onSaveDraft,
  draftSavedNotice,
  recordingTarget,
  recordingSeconds,
  transcribingTarget,
  onToggleVoice,
  onOpenPdfAt,
  onGoToNotes,
}: FeynmanViewProps) {
  const { lang, t } = useLanguage();
  const te = t.exam;
  const isEn = lang === "en";

  return (
    <div className="space-y-5">
      <div className="card-surface flex items-center gap-2 overflow-x-auto p-3">
        {activeTopics.map((tp) => {
          const isSel = selectedTopic?.id === tp.id;
          return (
            <button
              key={tp.id}
              type="button"
              data-testid="feynman-topic"
              onClick={() => onSelectTopic(tp)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                isSel
                  ? "bg-[var(--color-ink-900)] text-[var(--color-canvas)]"
                  : "bg-[var(--color-sunken)] text-ink-700 hover:bg-[var(--color-gold-100)] hover:text-[var(--color-gold-800)]"
              }`}
            >
              <span className="max-w-[210px] truncate">{tp.title}</span>
              {tp.status === "MASTERED" && (
                <CheckCircle2
                  className={`h-3.5 w-3.5 ${isSel ? "text-[var(--color-ok)]" : "text-[var(--color-ok)]"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {selectedTopic ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <form onSubmit={onSubmit} className="card-surface p-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gold-800)]">
                    {isEn ? "Prompt" : "Consegna"}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-[var(--color-ink-900)]">
                    {isEn
                      ? `Explain "${selectedTopic.title}" in your own words.`
                      : `Spiega "${selectedTopic.title}" a parole tue.`}
                  </h2>
                </div>
                {activeSessionId && (
                  <button
                    type="button"
                    onClick={onResetSession}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[var(--color-gold-200)] bg-[var(--color-gold-100)]/60 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-gold-800)]"
                  >
                    <RotateCcw className="h-3 w-3" /> {te.restart}
                  </button>
                )}
              </div>

              <textarea
                rows={7}
                required
                data-testid="feynman-explanation"
                value={explanation}
                onChange={(e) => onExplanationChange(e.target.value)}
                placeholder={
                  transcribingTarget === "FEYNMAN"
                    ? te.transcribingPlaceholder
                    : activeSessionId
                    ? te.feynmanReplyPlaceholder
                    : te.feynmanStartPlaceholder
                }
                className="mt-4 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] p-4 text-sm transition focus:border-[var(--color-gold-700)] focus:bg-[var(--color-paper)]"
              />

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  disabled={
                    evaluating ||
                    recordingTarget !== null ||
                    transcribingTarget !== null ||
                    explanation.trim().length < 5
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-ink-900)] px-4 py-2 text-xs font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-900)] disabled:opacity-50"
                >
                  {evaluating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {te.analyzingBtn}
                    </>
                  ) : (
                    <>
                      <Brain className="h-3.5 w-3.5" />
                      {activeSessionId ? te.sendAnswerBtn : te.checkUnderstandingBtn}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onToggleVoice("FEYNMAN")}
                  disabled={
                    transcribingTarget === "FEYNMAN" ||
                    evaluating ||
                    (recordingTarget !== null && recordingTarget !== "FEYNMAN")
                  }
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                    recordingTarget === "FEYNMAN"
                      ? "animate-pulse border-[var(--color-danger-fill)] bg-[var(--color-danger-fill)] text-white"
                      : "border-[var(--color-line)] bg-[var(--color-paper)] text-ink-700 hover:bg-[var(--color-sunken)]"
                  } disabled:opacity-50`}
                >
                  {transcribingTarget === "FEYNMAN" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-gold-800)]" />
                      {te.transcribingBtn}
                    </>
                  ) : recordingTarget === "FEYNMAN" ? (
                    <>
                      <Square className="h-3 w-3 fill-current" />
                      {te.stopBtn} ({recordingSeconds}s)
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />
                      {te.voiceBtn}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  data-testid="feynman-save-draft"
                  onClick={onSaveDraft}
                  className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-[var(--color-sunken)]"
                >
                  {draftSavedNotice
                    ? isEn
                      ? "Draft saved ✓"
                      : "Bozza salvata ✓"
                    : isEn
                    ? "Save draft"
                    : "Salva bozza"}
                </button>
              </div>
            </form>

            {feynmanResult?.transcript && feynmanResult.transcript.length > 0 && (
              <div className="card-surface max-h-72 space-y-2.5 overflow-y-auto p-5 text-xs">
                {feynmanResult.transcript.map((turn, idx) => (
                  <div
                    key={idx}
                    className={`rounded-2xl p-3.5 ${
                      turn.role === "student"
                        ? "ml-8 bg-[var(--color-ink-900)] text-[var(--color-canvas)]"
                        : "mr-8 border border-[var(--color-gold-200)] bg-[var(--color-sunken)] text-ink-800"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide opacity-70">
                      <span>{turn.role === "student" ? te.studentRole : te.examinerRole}</span>
                      {turn.score !== undefined && <span>{turn.score}/100</span>}
                    </div>
                    <p className="leading-relaxed">{turn.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-span-5">
            {feynmanResult ? (
              <>
                <div className="card-surface p-5 text-xs">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                      {te.rubricHeader}
                    </span>
                    <span
                      className={`font-mono rounded-lg px-2.5 py-0.5 text-sm font-extrabold ${
                        feynmanResult.passed
                          ? "bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                          : "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                      }`}
                    >
                      {feynmanResult.mastery_score} / 100
                    </span>
                  </div>

                  {feynmanResult.rubric && feynmanResult.rubric.length > 0 ? (
                    <div className="space-y-2">
                      {feynmanResult.rubric.map((item, ri) => (
                        <div key={ri} className="rounded-xl bg-[var(--color-sunken)] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink-800">{item.concept}</span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span
                                className={`font-bold ${
                                  item.status === "COVERED"
                                    ? "text-[var(--color-ok)]"
                                    : item.status === "PARTIAL"
                                    ? "text-[var(--color-warn)]"
                                    : "text-[var(--color-danger)]"
                                }`}
                              >
                                {item.status === "COVERED"
                                  ? te.rubricCovered
                                  : item.status === "PARTIAL"
                                  ? te.rubricPartial
                                  : te.rubricMissing}
                              </span>
                              {item.source_page && (
                                <button
                                  type="button"
                                  onClick={() => onOpenPdfAt(item.source_doc_id, item.source_page!)}
                                  className="rounded bg-[var(--color-paper)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-gold-800)] shadow-2xs hover:underline"
                                >
                                  {te.pageShort} {item.source_page}
                                </button>
                              )}
                            </div>
                          </div>
                          {item.evidence && (
                            <p className="mt-1 text-[11px] text-ink-500">{item.evidence}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="card-surface p-5 text-xs">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    {te.toClarify}
                  </p>
                  {feynmanResult.missing_or_wrong.length === 0 ? (
                    <p className="font-medium text-[var(--color-ok)]">{te.masteryReached}</p>
                  ) : (
                    <ul className="space-y-1.5 text-ink-600">
                      {feynmanResult.missing_or_wrong.map((g, i) => (
                        <li key={i} className="border-b border-[var(--color-line)] pb-1.5 last:border-none">
                          {g}
                        </li>
                      ))}
                    </ul>
                  )}
                  {feynmanResult.auto_generated_gap_cards &&
                    feynmanResult.auto_generated_gap_cards.length > 0 && (
                      <p className="mt-3 font-semibold text-[var(--color-gold-800)]">
                        {te.gapCardsAddedPrefix} {feynmanResult.auto_generated_gap_cards.length}{" "}
                        {te.gapCardsAddedSuffix}
                      </p>
                    )}
                </div>
              </>
            ) : (
              <div className="card-surface p-6 text-xs text-ink-500">
                <p className="font-bold text-[var(--color-ink-900)]">{te.evalHeader}</p>
                <p className="mt-2 leading-relaxed">
                  {isEn
                    ? "Submit your first explanation (written or spoken) to unlock the rubric evaluation and targeted gap flashcards."
                    : "Invia la tua prima spiegazione (scritta o a voce) per ricevere la valutazione su rubrica e le flashcard sui concetti mancanti."}
                </p>
                <button
                  type="button"
                  onClick={onGoToNotes}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 py-1.5 font-semibold text-ink-700 hover:bg-[var(--color-sunken)]"
                >
                  <BookOpen className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />
                  {te.notesTab}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card-surface p-8 text-center text-sm text-ink-500">
          {te.selectTopicHint}
        </div>
      )}
    </div>
  );
}
