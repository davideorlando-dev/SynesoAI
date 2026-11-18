"use client";

import Link from "next/link";
import type { ExamTimeline, TimelineDay } from "@/lib/api";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Il binario della home: dietro quello che hai fatto, davanti quello che il
 * piano ti chiede, e in fondo l'esame.
 *
 * Una sola linea orizzontale attraversa tutte le colonne: ogni colonna è una
 * griglia di tre righe (sopra, filetto, sotto) con le stesse altezze, così il
 * filetto resta continuo senza posizionamenti assoluti da ritoccare a mano.
 */

const ROW_HEIGHTS = "grid grid-rows-[96px_1px_120px]";
const TICK_MIN_PX = 6;
const TICK_MAX_PX = 56;

function formatDay(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
  });
}

function formatExamDate(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
  });
}

function tickHeight(activities: number, peak: number): number {
  if (activities <= 0) return 0;
  if (peak <= 1) return TICK_MAX_PX / 2;
  const ratio = activities / peak;
  return Math.round(TICK_MIN_PX + ratio * (TICK_MAX_PX - TICK_MIN_PX));
}

function dayHref(examId: string, day: TimelineDay): string {
  const first = day.tasks[0];
  if (first?.kind === "MOCK") return `/exam/?id=${examId}&tab=MOCK`;
  const topic = first?.topic_id ? `&topicId=${first.topic_id}` : "";
  return `/exam/?id=${examId}&tab=STUDY${topic}`;
}

export function TimelineRail({ timeline }: { timeline: ExamTimeline }) {
  const { lang, t } = useLanguage();
  const tl = t.timeline;
  const locale = lang === "en" ? "en-US" : "it-IT";

  const exam = timeline.exam;
  const peak = Math.max(1, ...timeline.past.map((p) => p.activities));
  const late = timeline.late_days;
  const lateCount = late.reduce((sum, d) => sum + d.tasks.length, 0);

  return (
    <div className="flex items-stretch">
      <div className="flex min-w-0 flex-1 overflow-x-auto pb-1">
        {/* Dietro: un'asta per ogni giorno, alta quanto le attività di quel giorno. */}
        <section className={`${ROW_HEIGHTS} w-[176px] shrink-0`}>
          <div className="flex flex-col justify-end pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {tl.behind(timeline.past_summary.days)}
            </p>
            <p className="mt-1 text-[11px] text-ink-500">
              {timeline.past_summary.activities > 0
                ? tl.behindSummary(
                    timeline.past_summary.activities,
                    timeline.past_summary.active_days
                  )
                : tl.behindEmpty}
            </p>
          </div>
          <div className="bg-[var(--color-line)]" />
          <div
            className="flex items-start gap-[2px]"
            role="img"
            aria-label={tl.railLabel(
              timeline.past_summary.activities,
              timeline.past_summary.days
            )}
          >
            {timeline.past.map((day) => (
              <span
                key={day.date}
                className="w-[3px] shrink-0 rounded-b-[2px] bg-[var(--color-line-strong)]"
                style={{ height: `${tickHeight(day.activities, peak)}px` }}
              />
            ))}
          </div>
        </section>

        {/* Oggi: l'unico segno d'oro della schermata. */}
        <section className={`${ROW_HEIGHTS} relative w-[248px] shrink-0 pl-4`}>
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-[2px] bg-[var(--color-gold-700)]"
          />
          <div className="flex flex-col justify-end pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-gold-800)]">
              {tl.today}
            </p>
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink-800">
              {timeline.today
                ? timeline.today.tasks.map((task) => task.title).join(", ")
                : tl.todayEmpty}
            </p>
            {lateCount > 0 && (
              <Link
                href={`/exam/?id=${exam.id}&tab=STUDY`}
                className="mt-1.5 w-fit text-[11px] font-semibold text-[var(--color-danger)] underline-offset-2 hover:underline"
              >
                {tl.lateLabel(lateCount)}
              </Link>
            )}
          </div>
          <div className="bg-[var(--color-line)]" />
          <div />
        </section>

        {/* Davanti: i giorni che il piano ha già scritto. */}
        {timeline.upcoming.map((day) => (
          <section key={day.date} className={`${ROW_HEIGHTS} w-[140px] shrink-0 pr-4`}>
            <div className="flex flex-col justify-end">
              <span
                aria-hidden="true"
                className="h-3 w-px bg-[var(--color-line-strong)]"
              />
            </div>
            <div className="bg-[var(--color-line)]" />
            <Link
              href={dayHref(exam.id, day)}
              className="group pt-3 transition hover:text-[var(--color-ink-900)]"
            >
              <p className="text-xs font-semibold text-ink-800 group-hover:text-[var(--color-ink-900)]">
                {formatDay(day.date, locale)}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-500">
                {day.tasks.map((task) => task.title).join(", ")}
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink-500">
                {tl.minutesShort(day.minutes)}
              </p>
            </Link>
          </section>
        ))}

        {/* Pochi giorni in programma: il filetto arriva comunque in fondo. */}
        <section className={`${ROW_HEIGHTS} min-w-[24px] flex-1`}>
          <div />
          <div className="bg-[var(--color-line)]" />
          <div />
        </section>
      </div>

      {/* L'esame: l'unico blocco pieno, e sta sempre in vista. */}
      {exam.exam_date && (
        <section className={`${ROW_HEIGHTS} w-[184px] shrink-0 pl-4`}>
          <div className="flex flex-col justify-end">
            <div className="rounded-card bg-[var(--color-ink-surface)] px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-gold-on-ink)]">
                {formatExamDate(exam.exam_date, locale)}
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--color-canvas)]">{tl.examBlock}</p>
            </div>
          </div>
          <div className="bg-[var(--color-line)]" />
          <div />
        </section>
      )}
    </div>
  );
}
