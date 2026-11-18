"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { ExamAnalyticsResponse, Topic } from "@/lib/api";

interface AnalyticsViewProps {
  analytics: ExamAnalyticsResponse | null;
  activeTopics: Topic[];
  masteredCount: number;
  onOpenTopicStudy: (topic: Topic) => void;
}

export function AnalyticsView({
  analytics,
  activeTopics,
  masteredCount,
  onOpenTopicStudy,
}: AnalyticsViewProps) {
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const weeklyMax = Math.max(1, ...(analytics?.weekly_activity.map((d) => d.count) || [1]));
  const enWeekDays = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-surface p-5">
          <div className="text-xs text-ink-500">{t.homeV2.fsrsRetention}</div>
          <div className="font-mono mt-2 text-3xl font-extrabold text-[var(--color-ink-900)]">
            {analytics?.fsrs_retention !== null && analytics?.fsrs_retention !== undefined
              ? `${analytics.fsrs_retention}%`
              : "—"}
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="text-xs text-ink-500">{t.homeV2.hoursLeft}</div>
          <div className="font-mono mt-2 text-3xl font-extrabold text-[var(--color-ink-900)]">
            {analytics
              ? `${(analytics.estimated_minutes_left / 60).toFixed(1).replace(".", ",")} h`
              : "—"}
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="text-xs text-ink-500">{t.homeV2.gradeEstimate}</div>
          <div className="font-mono mt-2 text-3xl font-extrabold text-[var(--color-ink-900)]">
            {analytics?.estimated_grade_30 !== null &&
            analytics?.estimated_grade_30 !== undefined ? (
              <>
                {analytics.estimated_grade_30}
                <span className="text-lg text-ink-500">/30</span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="card-surface p-5">
          <div className="text-xs text-ink-500">
            {isEn ? "Consolidated topics" : "Argomenti consolidati"}
          </div>
          <div className="font-mono mt-2 text-3xl font-extrabold text-[var(--color-ink-900)]">
            {analytics ? (
              <>
                {analytics.topics_mastered}
                <span className="text-lg text-ink-500">/{analytics.topics_total}</span>
              </>
            ) : (
              `${masteredCount}/${activeTopics.length}`
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="card-surface p-6 lg:col-span-7">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--color-ink-900)]">
              {isEn
                ? "Reviews & checks (last 7 days)"
                : "Ripassi e verifiche (ultimi 7 giorni)"}
            </h3>
            <span className="text-[11px] text-ink-500">
              {isEn ? "Last 7 days" : "Ultimi 7 giorni"}
            </span>
          </div>
          <div className="flex h-44 items-end justify-between gap-3 px-2 text-center text-xs text-ink-500">
            {(analytics?.weekly_activity || []).map((day, idx) => {
              const pct =
                day.count === 0
                  ? 6
                  : Math.max(14, Math.round((day.count / weeklyMax) * 100));
              const isToday = idx === (analytics?.weekly_activity.length || 0) - 1;
              const dayLabel = isEn
                ? (enWeekDays[day.weekday_idx] ?? day.label)
                : day.label;
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-36 w-full items-end">
                    <div
                      title={`${day.date}: ${day.count}`}
                      className={`w-full rounded-t-lg transition-all ${
                        day.count === 0
                          ? "bg-[var(--color-sunken)]"
                          : isToday
                          ? "bg-[var(--color-ink-900)]"
                          : "bg-[var(--color-ink-900)]"
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className={isToday ? "font-bold text-[var(--color-gold-800)]" : ""}>
                    {dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-surface p-6 lg:col-span-5">
          <h3 className="mb-4 text-sm font-bold text-[var(--color-ink-900)]">
            {t.homeV2.topicProgressTitle}
          </h3>
          <div className="divide-y divide-[var(--color-line)] text-xs">
            {(analytics?.topic_mastery || activeTopics).map((tp) => (
              <div
                key={tp.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    const found = activeTopics.find((x) => x.id === tp.id);
                    if (found) onOpenTopicStudy(found);
                  }}
                  className="truncate text-left font-medium text-ink-700 hover:text-[var(--color-gold-800)]"
                >
                  {tp.title}
                </button>
                {tp.mastery_score > 0 ? (
                  <span
                    className={`font-mono shrink-0 font-bold ${
                      tp.mastery_score >= 75
                        ? "text-[var(--color-ok)]"
                        : "text-[var(--color-gold-800)]"
                    }`}
                  >
                    {tp.mastery_score}%
                  </span>
                ) : (
                  <span className="shrink-0 text-ink-500">
                    {isEn ? "Not started" : "Da iniziare"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
