"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TimelineRail } from "@/components/home/TimelineRail";
import { useLanguage } from "@/components/LanguageProvider";
import type { ExamInsights, ExamTimeline as ExamTimelineData } from "@/lib/api";

/**
 * La home di Syneso: una data, una linea, una frase.
 *
 * Tutto quello che si legge qui viene dall'endpoint timeline: il conto dei
 * giorni, le attività registrate, il piano e la proiezione. Nessun numero è
 * calcolato qui dentro se non la somma degli ultimi sette giorni, che serve
 * solo a una delle quattro cifre in fondo.
 */

const WEEK_DAYS = 7;

function formatLongDate(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function startHref(timeline: ExamTimelineData): string {
  const first = timeline.today?.tasks[0] ?? timeline.late_days[0]?.tasks[0];
  const examId = timeline.exam.id;
  if (first?.kind === "MOCK") return `/exam/?id=${examId}&tab=MOCK`;
  const topic = first?.topic_id ? `&topicId=${first.topic_id}` : "";
  return `/exam/?id=${examId}&tab=STUDY${topic}`;
}

function Headline({ timeline }: { timeline: ExamTimelineData }) {
  const { lang, t } = useLanguage();
  const tl = t.timeline;
  const days = timeline.days_left;
  const title = timeline.exam.title;
  const examDateLabel = timeline.exam.exam_date
    ? formatLongDate(timeline.exam.exam_date, lang === "en" ? "en-US" : "it-IT")
    : "";

  if (days === null) {
    return (
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-[var(--color-ink-900)]">{title}</h2>
        <p className="mt-1 text-sm text-ink-500">
          {tl.noDate} · {tl.noDateSub}
        </p>
      </div>
    );
  }

  if (days <= 1) {
    const label = days < 0 ? tl.examPassed : days === 0 ? tl.examToday : tl.examTomorrow;
    return (
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-[var(--color-ink-900)] sm:text-4xl">
          {label}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {[title, examDateLabel].filter(Boolean).join(" · ")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
      <span
        data-testid="timeline-days"
        className="font-mono text-[76px] font-bold leading-[0.85] tracking-tight text-[var(--color-ink-900)] sm:text-[92px]">
        {days}
      </span>
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight text-[var(--color-ink-900)] sm:text-2xl">
          {tl.daysToLabel(title)}
        </h2>
        <p className="mt-0.5 text-sm text-ink-500">
          {[examDateLabel, timeline.exam.university, timeline.exam.professor]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
}

function Projection({ timeline }: { timeline: ExamTimelineData }) {
  const { t } = useLanguage();
  const tl = t.timeline;
  const p = timeline.projection;
  if (!p || p.topics_total === 0) return null;

  if (p.days_left <= 0) {
    return <p className="text-lg leading-snug text-ink-800">{tl.projectionNoTime}</p>;
  }

  if (p.covers_everything) {
    return (
      <p
        data-testid="timeline-projection"
        className="max-w-2xl text-lg leading-snug text-ink-800 sm:text-xl"
      >
        {tl.projectionAll}
      </p>
    );
  }

  return (
    <p
      data-testid="timeline-projection"
      className="max-w-2xl text-lg leading-snug text-ink-800 sm:text-xl"
    >
      {tl.projectionPartial(p.topics_projected, p.topics_total)}{" "}
      {p.extra_minutes_per_day > 0 ? (
        <span className="font-semibold text-[var(--color-ink-900)]">
          {tl.projectionExtra(p.extra_minutes_per_day)}
        </span>
      ) : (
        p.next_topic_out_of_reach && (
          <span className="text-ink-600">
            {tl.projectionOutOfReach(p.next_topic_out_of_reach)}
          </span>
        )
      )}
    </p>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[var(--color-ink-900)]">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}

export function ExamTimeline({
  timeline,
  insights,
}: {
  timeline: ExamTimelineData;
  insights: ExamInsights | null;
}) {
  const { t } = useLanguage();
  const tl = t.timeline;

  const todayMinutes = timeline.today?.minutes ?? 0;
  const retention = insights?.fsrs_retention_pct ?? null;
  const lastMock = insights?.latest_mock_score ?? null;
  const weekActivities = timeline.past
    .slice(-WEEK_DAYS)
    .reduce((sum, day) => sum + day.activities, 0);

  return (
    <section className="space-y-10" data-testid="exam-timeline">
      <Headline timeline={timeline} />

      <TimelineRail timeline={timeline} />

      <div className="space-y-6">
        <Projection timeline={timeline} />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href={startHref(timeline)}
            data-testid="timeline-start"
            className="inline-flex items-center rounded-card bg-[var(--color-ink-900)] px-6 py-3.5 text-sm font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-800)]"
          >
            {todayMinutes > 0 ? tl.startToday(todayMinutes) : tl.startTodayPlain}
          </Link>
          <Link
            href={`/exam/?id=${timeline.exam.id}&tab=STUDY&panel=plan`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 underline underline-offset-4 transition hover:text-[var(--color-ink-900)]"
          >
            {tl.movePlan}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="border-t border-[var(--color-line)] pt-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <Figure
            label={tl.statTopics}
            value={
              insights ? `${insights.topics_mastered} / ${insights.topics_total}` : tl.noValue
            }
          />
          <Figure
            label={tl.statRetention}
            value={retention !== null ? `${retention} %` : tl.noValue}
          />
          <Figure
            label={tl.statLastMock}
            value={lastMock !== null ? `${lastMock} / 30` : tl.noValue}
          />
          <Figure
            label={tl.statWeek}
            value={`${weekActivities}`}
            hint={tl.statWeekUnit}
          />
        </div>
      </div>
    </section>
  );
}
