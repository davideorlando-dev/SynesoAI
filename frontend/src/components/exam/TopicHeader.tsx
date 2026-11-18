"use client";

import { Brain, EyeOff } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { Topic } from "@/lib/api";
import { PRIORITY_STYLE, TopicPriority } from "@/lib/topicPriority";

interface TopicHeaderProps {
  topic: Topic;
  /** Tutti gli argomenti attivi: servono al selettore che compare a pannello chiuso. */
  topics: Topic[];
  showTopicPicker: boolean;
  onSelectTopic: (topic: Topic) => void;
  onChangePriority: (topic: Topic, priority: TopicPriority) => void;
  onToggleExclude: (topic: Topic, excluded: boolean) => void;
  /** Vero mentre un aggiornamento di questo argomento è in corso. */
  updating: boolean;
  onGoToFeynman: () => void;
}

/** Titolo dell'argomento aperto, con priorità, padronanza e i comandi che lo riguardano. */
export function TopicHeader({
  topic,
  topics,
  showTopicPicker,
  onSelectTopic,
  onChangePriority,
  onToggleExclude,
  updating,
  onGoToFeynman,
}: TopicHeaderProps) {
  const { t } = useLanguage();
  const te = t.exam;

  return (
  <div className="mb-5 border-b border-[var(--color-line)] pb-4">
    {showTopicPicker && (
      <div className="mb-3 flex items-center gap-2">
        <select
          value={topic.id}
          onChange={(e) => {
            const found = topics.find((x) => x.id === e.target.value);
            if (found) onSelectTopic(found);
          }}
          className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] px-3 py-1.5 text-xs font-semibold text-[var(--color-gold-800)]"
        >
          {topics.map((tp, idx) => (
            <option key={tp.id} value={tp.id}>
              {idx + 1}. {tp.title}
            </option>
          ))}
        </select>
      </div>
    )}
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <select
        value={topic.priority}
        disabled={updating}
        onChange={(e) =>
          onChangePriority(topic, e.target.value as TopicPriority)
        }
        className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
          PRIORITY_STYLE[topic.priority]
        }`}
      >
        <option value="CORE">CORE</option>
        <option value="IMPORTANT">IMPORTANT</option>
        <option value="DETAIL">DETAIL</option>
      </select>

      <div className="flex flex-wrap items-center gap-1.5">
        {topic.mastery_score > 0 && (
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
              topic.status === "MASTERED"
                ? "border border-[var(--color-ok)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]"
                : "border border-[var(--color-warn)] bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
            }`}
          >
            {topic.mastery_score}%
          </span>
        )}
        <button
          type="button"
          onClick={onGoToFeynman}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-[var(--color-sunken)]"
        >
          <Brain className="h-3 w-3" />
          Feynman
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={() => onToggleExclude(topic, !topic.excluded)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 text-[11px] font-semibold text-ink-500 transition hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] disabled:opacity-50"
        >
          <EyeOff className="h-3 w-3" />
          {topic.excluded ? te.restoreTopicBtn : te.skipTopicBtn}
        </button>
      </div>
    </div>

    <h2 className="text-xl font-bold tracking-tight text-[var(--color-ink-900)]">
      {topic.title}
    </h2>
    <p className="mt-1 text-xs leading-relaxed text-ink-500">
      {topic.description}
    </p>
  </div>
  );
}
