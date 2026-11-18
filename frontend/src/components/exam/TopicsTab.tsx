"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { Topic } from "@/lib/api";
import { PRIORITY_DOT, TopicPriority } from "@/lib/topicPriority";

interface TopicsTabProps {
  activeTopics: Topic[];
  excludedTopics: Topic[];
  selectedTopic: Topic | null;
  onSelectTopic: (topic: Topic) => void;
  /** Crea l'argomento e dice se c'è riuscita: in caso affermativo il modulo si svuota. */
  onCreateTopic: (
    title: string,
    description: string,
    priority: TopicPriority
  ) => Promise<boolean>;
  creating: boolean;
  onRestoreTopic: (topic: Topic) => void;
  /** Argomento su cui è in corso un aggiornamento, per disabilitarne il comando. */
  updatingTopicId: string | null;
}

/**
 * Elenco degli argomenti del piano, con l'aggiunta manuale e quelli esclusi.
 *
 * Il modulo del nuovo argomento tiene qui il proprio stato — titolo,
 * descrizione, priorità, aperto o chiuso — perché è suo e di nessun altro:
 * la pagina deve solo sapere che le si chiede di creare un argomento.
 */
export function TopicsTab({
  activeTopics,
  excludedTopics,
  selectedTopic,
  onSelectTopic,
  onCreateTopic,
  creating,
  onRestoreTopic,
  updatingTopicId,
}: TopicsTabProps) {
  const { lang, t } = useLanguage();
  const te = t.exam;
  const isEn = lang === "en";

  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicDesc, setNewTopicDesc] = useState("");
  const [newTopicPriority, setNewTopicPriority] = useState<TopicPriority>("CORE");
  const [showExcludedTopics, setShowExcludedTopics] = useState(false);
  const savingNewTopic = creating;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!newTopicTitle.trim()) return;
    const created = await onCreateTopic(
      newTopicTitle.trim(),
      newTopicDesc.trim(),
      newTopicPriority
    );
    if (!created) return;
    setNewTopicTitle("");
    setNewTopicDesc("");
    setNewTopicPriority("CORE");
    setAddingTopic(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAddingTopic((prev) => !prev)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-gold-100)] px-3 py-2 text-xs font-semibold text-[var(--color-gold-800)] transition hover:bg-[var(--color-gold-100)]"
      >
        {addingTopic ? (
          <>
            <X className="h-3.5 w-3.5" /> {te.cancel}
          </>
        ) : (
          <>
            <Plus className="h-3.5 w-3.5" /> {te.addTopicBtn}
          </>
        )}
      </button>

      {addingTopic && (
        <form
          onSubmit={handleSubmit}
          className="space-y-2 rounded-xl border border-[var(--color-gold-200)] bg-[var(--color-gold-100)]/40 p-3 text-xs"
        >
          <input
            required
            value={newTopicTitle}
            onChange={(e) => setNewTopicTitle(e.target.value)}
            placeholder={te.addTopicTitlePlaceholder}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs focus:border-[var(--color-gold-700)]"
          />
          <textarea
            rows={2}
            value={newTopicDesc}
            onChange={(e) => setNewTopicDesc(e.target.value)}
            placeholder={te.addTopicDescPlaceholder}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs focus:border-[var(--color-gold-700)]"
          />
          <div className="flex items-center gap-2">
            <select
              value={newTopicPriority}
              onChange={(e) =>
                setNewTopicPriority(
                  e.target.value as "CORE" | "IMPORTANT" | "DETAIL"
                )
              }
              className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-1.5 text-[11px] font-semibold text-ink-700"
            >
              <option value="CORE">CORE</option>
              <option value="IMPORTANT">IMPORTANT</option>
              <option value="DETAIL">DETAIL</option>
            </select>
            <button
              type="submit"
              disabled={savingNewTopic || newTopicTitle.trim().length < 2}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--color-ink-900)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-canvas)] hover:bg-[var(--color-ink-900)] disabled:opacity-50"
            >
              {savingNewTopic ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {te.saveTopicBtn}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--color-sunken)] px-2.5 py-1.5 text-[10px] font-semibold text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT.CORE}`} />
          {te.prioCore}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT.IMPORTANT}`} />
          {te.prioImportant}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT.DETAIL}`} />
          {te.prioDetail}
        </span>
      </div>

      <div className="space-y-1">
        {activeTopics.map((tp, idx) => {
          const isSelected = selectedTopic?.id === tp.id;
          return (
            <button
              key={tp.id}
              data-testid="topic-item"
              onClick={() => onSelectTopic(tp)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition ${
                isSelected
                  ? "bg-[var(--color-gold-100)] text-[var(--color-gold-800)]"
                  : "text-ink-700 hover:bg-[var(--color-sunken)]"
              }`}
            >
              <span className="flex items-start gap-2">
                <span
                  title={tp.priority}
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[tp.priority]}`}
                />
                <span className="line-clamp-2 font-semibold leading-snug">
                  {idx + 1}. {tp.title}
                </span>
              </span>
              {tp.status === "MASTERED" ? (
                <span className="shrink-0 font-bold text-[var(--color-ok)]">
                  {isEn ? "Done" : "Fatto"}
                </span>
              ) : isSelected ? (
                <span className="shrink-0 font-bold text-[var(--color-gold-800)]">
                  {isEn ? "Active" : "In corso"}
                </span>
              ) : tp.mastery_score > 0 ? (
                <span className="shrink-0 font-mono text-[10px] font-bold text-[var(--color-warn)]">
                  {tp.mastery_score}%
                </span>
              ) : (
                <span className="shrink-0 text-ink-300">—</span>
              )}
            </button>
          );
        })}
      </div>

      {excludedTopics.length > 0 && (
        <div className="mt-3 border-t border-[var(--color-line)] pt-2.5 text-xs">
          <button
            type="button"
            onClick={() => setShowExcludedTopics((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-500 hover:bg-[var(--color-sunken)]"
          >
            <span>
              {te.excludedTopicsHeader} ({excludedTopics.length})
            </span>
            {showExcludedTopics ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {showExcludedTopics && (
            <div className="mt-1.5 space-y-1">
              {excludedTopics.map((tp) => (
                <div
                  key={tp.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)]/70 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="truncate text-ink-500 line-through">
                    {tp.title}
                  </span>
                  <button
                    type="button"
                    disabled={updatingTopicId === tp.id}
                    onClick={() => onRestoreTopic(tp)}
                    className="shrink-0 font-semibold text-[var(--color-gold-800)] hover:underline disabled:opacity-50"
                  >
                    {te.restoreTopicBtn}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
