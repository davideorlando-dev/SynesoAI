"use client";

import { useMemo } from "react";
import { Check, Lock } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { Topic } from "@/lib/api";
import { PRIORITY_DOT } from "@/lib/topicPriority";
import { buildTopicGraph, NODE_H, NODE_W } from "@/lib/topicGraph";

/**
 * La mappa dei prerequisiti.
 *
 * Il piano di studio decide l'ordine delle cose proprio da queste dipendenze,
 * ma finora l'ordine era l'unica cosa visibile: il perché restava dentro il
 * database. Qui si vede, e serve per muoversi — un nodo è un argomento da
 * aprire, non una decorazione.
 *
 * La disposizione (`lib/topicGraph.ts`) è separata dal disegno: qui non si
 * calcola nessuna coordinata.
 */

export function TopicMap({
  topics,
  selectedTopicId,
  onSelectTopic,
}: {
  topics: Topic[];
  selectedTopicId: string | null;
  onSelectTopic: (topic: Topic) => void;
}) {
  const { t } = useLanguage();
  const tm = t.topicMap;

  const graph = useMemo(() => buildTopicGraph(topics), [topics]);
  const topicById = useMemo(() => new Map(topics.map((tp) => [tp.id, tp])), [topics]);

  if (graph.nodes.length === 0) {
    return (
      <div className="card-surface p-8 text-center text-sm text-ink-500">{tm.empty}</div>
    );
  }

  return (
    <div className="card-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-title text-[22px] leading-tight text-[var(--color-ink-900)]">
          {tm.title}
        </h3>
        <p className="text-xs text-ink-500">
          {graph.edges.length > 0 ? tm.legend : tm.noPrerequisites}
        </p>
      </div>

      <div className="overflow-auto pb-2">
        <div
          className="relative"
          style={{ width: graph.width, height: graph.height, minWidth: "100%" }}
          role="group"
          aria-label={tm.ariaLabel(graph.nodes.length, graph.edges.length)}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            width={graph.width}
            height={graph.height}
          >
            <defs>
              <marker
                id="topic-map-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 1 L7 4 L0 7 z" fill="var(--color-line-strong)" />
              </marker>
            </defs>
            {graph.edges.map((edge) => (
              <path
                key={edge.id}
                data-testid="topic-map-edge"
                d={edge.path}
                fill="none"
                stroke="var(--color-line-strong)"
                strokeWidth={1.5}
                markerEnd="url(#topic-map-arrow)"
              />
            ))}
          </svg>

          {graph.nodes.map((node) => {
            const topic = topicById.get(node.id);
            if (!topic) return null;
            const isSelected = node.id === selectedTopicId;
            const isMastered = node.status === "MASTERED";
            const isLocked = node.status === "LOCKED";

            return (
              <button
                key={node.id}
                type="button"
                data-testid="topic-map-node"
                onClick={() => onSelectTopic(topic)}
                aria-current={isSelected ? "true" : undefined}
                style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                className={`absolute flex flex-col justify-between rounded-card border p-3 text-left transition ${
                  isSelected
                    ? "border-[var(--color-ink-900)] bg-[var(--color-ink-900)]"
                    : "border-[var(--color-line)] bg-[var(--color-paper)] hover:border-[var(--color-gold-700)]"
                }`}
              >
                <span className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      isSelected ? "bg-[var(--color-gold-500)]" : PRIORITY_DOT[node.priority]
                    }`}
                  />
                  <span
                    className={`line-clamp-2 text-xs font-semibold leading-snug ${
                      isSelected ? "text-[var(--color-canvas)]" : "text-[var(--color-ink-900)]"
                    }`}
                  >
                    {node.title}
                  </span>
                </span>

                <span
                  className={`flex items-center gap-1.5 text-[11px] ${
                    isSelected ? "text-[var(--color-gold-200)]" : "text-ink-500"
                  }`}
                >
                  {isMastered ? (
                    <>
                      <Check className="h-3 w-3 text-[var(--color-ok)]" />
                      {tm.statusMastered}
                    </>
                  ) : isLocked ? (
                    <>
                      <Lock className="h-3 w-3" />
                      {tm.statusLocked}
                    </>
                  ) : isSelected ? (
                    tm.statusCurrent
                  ) : node.masteryScore > 0 ? (
                    <span className="font-mono">{node.masteryScore}%</span>
                  ) : (
                    tm.statusReady
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
