"use client";

import { useState } from "react";
import { CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { StudyPlanItem, Topic } from "@/lib/api";
import { PRIORITY_DOT } from "@/lib/topicPriority";

function formatPlanDayLabel(
  isoDate: string,
  lang: "it" | "en",
  todayWord: string,
  tomorrowWord: string
): { label: string; isToday: boolean } {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return { label: isoDate, isToday: false };
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const shortDate = target.toLocaleDateString(lang === "en" ? "en-US" : "it-IT", {
    day: "numeric",
    month: "short",
  });
  if (diffDays === 0) return { label: `${todayWord} · ${shortDate}`, isToday: true };
  if (diffDays === 1) return { label: `${tomorrowWord} · ${shortDate}`, isToday: false };
  const weekday = target.toLocaleDateString(lang === "en" ? "en-US" : "it-IT", {
    weekday: "short",
  });
  return { label: `${weekday} ${shortDate}`, isToday: false };
}

interface PlanTabProps {
  plan: StudyPlanItem[];
  /** Serve per il titolo e i minuti stimati delle voci legate a un argomento. */
  topics: Topic[];
  completedCount: number;
  progressPct: number;
  onToggleItem: (itemId: string) => void;
  onSelectTopic: (topic: Topic) => void;
  onGoToMock: () => void;
  /**
   * Ripianifica con le ore indicate e restituisce il messaggio da mostrare,
   * oppure null se è andata male: l'errore lo racconta la pagina, che è dove
   * vivono gli errori di tutta la sezione.
   */
  onReplan: (hours: string) => Promise<string | null>;
  replanning: boolean;
  /** Ore al giorno dell'esame: il selettore vi si riallinea a ogni ricarica del piano. */
  defaultHours: string;
}

/**
 * Il piano di studio: avanzamento, ripianificazione e le voci giorno per giorno.
 *
 * Le ore della ripianificazione e il messaggio che compare dopo stanno qui,
 * perché riguardano solo questo riquadro: la pagina deve sapere soltanto che
 * le è stato chiesto di ripianificare.
 */
export function PlanTab({
  plan,
  topics,
  completedCount,
  progressPct,
  onToggleItem,
  onSelectTopic,
  onGoToMock,
  onReplan,
  replanning,
  defaultHours,
}: PlanTabProps) {
  const { lang, t } = useLanguage();
  const te = t.exam;
  const [replanHours, setReplanHours] = useState(defaultHours);
  const [knownDefault, setKnownDefault] = useState(defaultHours);
  const [replanDoneMsg, setReplanDoneMsg] = useState<string | null>(null);

  // Quando il piano ricaricato porta ore diverse — cambiate altrove, o appena
  // cambiate da qui — il selettore le segue. Si corregge durante il disegno e
  // non dentro un effetto: così non c'è un primo disegno col valore vecchio.
  if (defaultHours !== knownDefault) {
    setKnownDefault(defaultHours);
    setReplanHours(defaultHours);
  }

  async function handleReplan() {
    const message = await onReplan(replanHours);
    if (!message) return;
    setReplanDoneMsg(message);
    setTimeout(() => setReplanDoneMsg(null), 2500);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-ink-500">
            {completedCount} / {plan.length} {te.completedOf}
          </span>
          <span className="font-mono font-bold text-[var(--color-gold-800)]">{progressPct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-sunken)]">
          <div
            className="h-full rounded-full bg-[var(--color-ink-900)] transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] p-2">
          <select
            value={replanHours}
            onChange={(e) => setReplanHours(e.target.value)}
            aria-label={te.replanHoursLabel}
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--color-gold-800)]"
          >
            {Array.from(
              new Set(["0.5", "1", "1.5", "2", "2.5", "3", "4", "5", "6", "8", "10", "12", replanHours])
            )
              .sort((a, b) => Number(a) - Number(b))
              .map((v) => (
                <option key={v} value={v}>
                  {v} {te.replanHoursLabel}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => void handleReplan()}
            disabled={replanning}
            title={te.replanTitle}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-gold-100)] px-3 py-1.5 text-[11px] font-bold text-[var(--color-gold-800)] transition hover:bg-[var(--color-gold-100)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${replanning ? "animate-spin" : ""}`} />
            <span>{te.replanBtn}</span>
          </button>
        </div>
        {replanDoneMsg && (
          <p className="text-[11px] font-semibold text-[var(--color-ok)]">{replanDoneMsg}</p>
        )}
      </div>

      {(() => {
        const learnItems = plan.filter((p) => p.task_type !== "MOCK_REVIEW");
        const mockItems = plan.filter((p) => p.task_type === "MOCK_REVIEW");
        const byDay = new Map<string, typeof learnItems>();
        for (const item of learnItems) {
          const list = byDay.get(item.scheduled_date) || [];
          list.push(item);
          byDay.set(item.scheduled_date, list);
        }

        if (plan.length === 0) {
          return <p className="py-4 text-center text-xs text-ink-500">{te.planEmpty}</p>;
        }

        return (
          <div className="space-y-3.5 text-xs">
            {Array.from(byDay.entries()).map(([dateStr, dayItems]) => {
              const { label, isToday } = formatPlanDayLabel(
                dateStr,
                lang,
                te.planToday,
                te.planTomorrow
              );
              const dayMins = dayItems.reduce((acc, it) => {
                const tp = it.topic_id
                  ? topics.find((x) => x.id === it.topic_id)
                  : undefined;
                return acc + (tp?.estimated_minutes || 45);
              }, 0);
              return (
                <div key={dateStr} className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isToday ? "text-[var(--color-gold-800)]" : "text-ink-500"
                      }`}
                    >
                      {label}
                    </span>
                    <span className="font-mono text-[10px] text-ink-500">
                      {dayMins} min
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayItems.map((p) => {
                      const linkedTopic = p.topic_id
                        ? topics.find((tp) => tp.id === p.topic_id)
                        : undefined;
                      const matchPrio = p.title.match(/^\[(CORE|IMPORTANT|DETAIL)\]\s*/);
                      const prio = (linkedTopic?.priority ||
                        matchPrio?.[1] ||
                        "IMPORTANT") as "CORE" | "IMPORTANT" | "DETAIL";
                      const cleanTitle = p.title.replace(
                        /^\[(CORE|IMPORTANT|DETAIL)\]\s*/,
                        ""
                      );
                      return (
                        <div
                          key={p.id}
                          className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 transition ${
                            p.completed
                              ? "border-[var(--color-ok)] bg-[var(--color-ok-soft)]/40 text-ink-500"
                              : "border-[var(--color-line)] bg-[var(--color-sunken)] text-ink-700 hover:border-[var(--color-gold-200)] hover:bg-[var(--color-paper)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onToggleItem(p.id)}
                            title={te.markCompleteTitle}
                            className="mt-0.5 shrink-0"
                          >
                            {p.completed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-ok)]" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 text-ink-300 hover:text-[var(--color-gold-800)]" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => linkedTopic && onSelectTopic(linkedTopic)}
                            className={`flex flex-1 items-start gap-2 text-left ${
                              linkedTopic
                                ? "cursor-pointer hover:text-[var(--color-gold-800)]"
                                : "cursor-default"
                            }`}
                          >
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[prio]}`}
                            />
                            <span
                              className={`line-clamp-2 leading-snug ${
                                p.completed ? "line-through" : "font-semibold"
                              }`}
                            >
                              {cleanTitle}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {mockItems.length > 0 && (
              <div className="space-y-1.5 border-t border-[var(--color-line)] pt-3">
                <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gold-800)]">
                  {te.planFinalSprint}
                </div>
                {mockItems.map((p) => {
                  const shortLabel = p.title
                    .replace(/^Ripasso Finale \d+\/\d+:\s*/i, "")
                    .replace(/^Final Review \d+\/\d+:\s*/i, "");
                  const { label } = formatPlanDayLabel(
                    p.scheduled_date,
                    lang,
                    te.planToday,
                    te.planTomorrow
                  );
                  return (
                    <div
                      key={p.id}
                      className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 transition ${
                        p.completed
                          ? "border-[var(--color-ok)] bg-[var(--color-ok-soft)]/40 text-ink-500"
                          : "border-[var(--color-gold-200)] bg-[var(--color-gold-100)]/70 text-[var(--color-gold-800)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleItem(p.id)}
                        title={te.markCompleteTitle}
                        className="mt-0.5 shrink-0"
                      >
                        {p.completed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-ok)]" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-[var(--color-gold-800)] hover:text-[var(--color-gold-800)]" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onGoToMock()}
                        className="flex flex-1 items-start justify-between gap-2 text-left hover:underline"
                      >
                        <span className={`leading-snug ${p.completed ? "line-through" : "font-semibold"}`}>
                          {shortLabel}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] opacity-75">
                          {label}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
