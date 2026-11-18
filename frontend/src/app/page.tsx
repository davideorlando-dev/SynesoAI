"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  clearSavedActiveExam,
  getSavedActiveExamId,
  getSavedUserName,
  setSavedActiveExamId,
  setSavedUserName,
} from "@/lib/shellStorage";
import { useLanguage } from "@/components/LanguageProvider";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SynesoSymbol } from "@/components/SynesoLogo";
import {
  checkHealth,
  deleteExam,
  ExamInsights,
  ExamOverviewItem,
  ExamTimeline as ExamTimelineData,
  getExamInsights,
  getExamsOverview,
  getExamTimeline,
} from "@/lib/api";
import { ExamTimeline } from "@/components/home/ExamTimeline";
import { daysUntil } from "@/lib/dates";



function HomePageInner() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const hv = t.homeV2;
  const td = t.dashboard;
  const ob = t.onboarding;

  const viewParam = searchParams.get("view");
  const examParam = searchParams.get("exam");
  const isExamsView = viewParam === "exams";

  const [hydrated, setHydrated] = useState(false);
  const [userName, setUserName] = useState("");
  const [askingName, setAskingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [items, setItems] = useState<ExamOverviewItem[]>([]);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [insights, setInsights] = useState<ExamInsights | null>(null);
  const [timeline, setTimeline] = useState<ExamTimelineData | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [newExamSignal, setNewExamSignal] = useState(0);
  const [settingsSignal, setSettingsSignal] = useState(0);
  const [aboutSignal, setAboutSignal] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const online = await checkHealth();
    setBackendOnline(online);
    if (!online) {
      setLoading(false);
      return;
    }

    try {
      const overview = await getExamsOverview();

      overview.sort((a, b) => {
        const da = daysUntil(a.exam.exam_date);
        const db = daysUntil(b.exam.exam_date);
        if (da !== null && db !== null) {
          if (da >= 0 && db >= 0) return da - db;
          if (da >= 0) return -1;
          if (db >= 0) return 1;
        }
        if (da !== null && da >= 0) return -1;
        if (db !== null && db >= 0) return 1;
        return 0;
      });

      setItems(overview);

      const saved = getSavedActiveExamId();
      const chosenId =
        (examParam && overview.find((o) => o.exam.id === examParam)?.exam.id) ||
        (saved && overview.find((o) => o.exam.id === saved)?.exam.id) ||
        overview[0]?.exam.id ||
        null;

      setActiveExamId(chosenId);
      if (chosenId) {
        setSavedActiveExamId(chosenId);
        const [ins, line] = await Promise.all([
          getExamInsights(chosenId).catch(() => null),
          getExamTimeline(chosenId).catch(() => null),
        ]);
        setInsights(ins);
        setTimeline(line);
      } else {
        setInsights(null);
        setTimeline(null);
      }
    } finally {
      setLoading(false);
    }
  }, [examParam]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setUserName(getSavedUserName());
      setHydrated(true);
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  async function handleSelectActiveExam(nextId: string) {
    setActiveExamId(nextId);
    setSavedActiveExamId(nextId);
    const [ins, line] = await Promise.all([
      getExamInsights(nextId).catch(() => null),
      getExamTimeline(nextId).catch(() => null),
    ]);
    setInsights(ins);
    setTimeline(line);
  }

  async function handleDelete(id: string) {
    await deleteExam(id);
    clearSavedActiveExam(id);
    setActiveExamId((prev) => (prev === id ? null : prev));
    setConfirmDeleteId(null);
    await refresh();
  }

  function handleSaveOnboardingName(e: React.FormEvent) {
    e.preventDefault();
    const clean = nameDraft.trim();
    if (!clean) return;
    setSavedUserName(clean);
    setUserName(clean);
    setAskingName(false);
    setNameDraft("");
  }

  const isFirstAccess = hydrated && !loading && items.length === 0 && !userName && !isExamsView;

  const upcomingExamDays =
    items
      .map((i) => daysUntil(i.exam.exam_date))
      .filter((d): d is number => d !== null && d >= 0)
      .sort((a, b) => a - b)[0] ?? null;

  const pageTitle = isExamsView ? t.shell.navExams : ob.welcomeBack(userName);
  const pageSubtitle = isExamsView
    ? hv.activeExamsSub(items.length, upcomingExamDays)
    : items.length > 0
    ? hv.greetingSub
    : t.story.headline1;

  return (
    <AppShell
      activeSection={isExamsView ? "EXAMS" : "HOME"}
      activeExamId={activeExamId}
      pageTitle={pageTitle}
      pageSubtitle={pageSubtitle}
      hidePageTitle={!isExamsView && Boolean(timeline)}
      hideShell={isFirstAccess}
      openNewExamSignal={newExamSignal}
      openSettingsSignal={settingsSignal}
      openAboutSignal={aboutSignal}
      onUserNameChange={(name) => setUserName(name)}
      onActiveExamChange={(id) => void handleSelectActiveExam(id)}
      onDataChanged={() => void refresh()}
    >
      {!hydrated || loading ? (
        <div className="mx-auto max-w-6xl p-6 sm:p-8">
          <div className="grid gap-5 md:grid-cols-12">
            <div className="h-56 animate-pulse rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] md:col-span-7" />
            <div className="h-56 animate-pulse rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] md:col-span-5" />
          </div>
        </div>
      ) : isFirstAccess ? (
        /* ==================== WELCOME LANDING (PRIMO ACCESSO, NO SIDEBAR) ==================== */
        <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink-900)]">
          {/* Topbar dedicata */}
          <header className="border-b border-[var(--color-sunken)] bg-[var(--color-paper)]/90 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <SynesoSymbol className="h-8 w-8 shrink-0" />
                <span className="text-lg font-bold tracking-tight text-[var(--color-ink-900)]">Syneso</span>
                <span
                  className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold sm:inline-flex ${
                    backendOnline
                      ? "border-[var(--color-line-strong)] bg-[var(--color-paper)] text-ink-600"
                      : "border-[var(--color-danger)] bg-danger-soft text-danger"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      backendOnline ? "bg-[var(--color-ok)]" : "bg-[var(--color-danger)]"
                    }`}
                  />
                  {backendOnline ? t.shell.cloudActive : t.shell.cloudOffline}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setAboutSignal((n) => n + 1)}
                  className="hidden rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-sunken sm:inline-flex"
                >
                  {t.shell.helpBtn}
                </button>
                <LanguageToggle />
                <button
                  type="button"
                  disabled={!backendOnline}
                  onClick={() => setSettingsSignal((n) => n + 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:bg-sunken disabled:opacity-40"
                >
                  <KeyRound className="h-3.5 w-3.5 text-ink-500" />
                  <span className="hidden sm:inline">API Key</span>
                </button>
                <button
                  type="button"
                  disabled={!backendOnline}
                  onClick={() => setNewExamSignal((n) => n + 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-ink-900)] px-4 py-2 text-xs font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-800)] disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t.header.newExam}</span>
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-5xl space-y-7 px-6 py-10">
            {/* HERO CON ONDE LILLA/INDACO */}
            <section className="relative overflow-hidden rounded-3xl border border-[var(--color-line)] bg-gradient-to-br from-[var(--color-sunken)] via-[var(--color-sunken)] to-[var(--color-gold-200)] p-8  sm:p-12">
              {/* Onde decorative a destra */}
              <svg
                viewBox="0 0 600 400"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 top-0 h-full w-2/3 opacity-75"
              >
                <path
                  d="M260 -20C210 120 350 220 220 420H620V-20H260Z"
                  fill="var(--color-gold-200)"
                  fillOpacity="0.45"
                />
                <path
                  d="M360 -20C320 140 460 240 340 420H620V-20H360Z"
                  fill="var(--color-gold-500)"
                  fillOpacity="0.5"
                />
              </svg>

              <div className="relative max-w-2xl">
                {!askingName ? (
                  <div className="space-y-5 transition-all duration-300">
                    <span className="inline-flex items-center rounded-full border border-gold-200 bg-paper px-3.5 py-1 text-xs font-semibold text-[var(--color-gold-800)] ">
                      {ob.pill}
                    </span>

                    <h2 className="text-3xl font-extrabold tracking-tight text-[var(--color-ink-900)] sm:text-5xl">
                      {ob.title}
                    </h2>

                    <p className="max-w-xl text-sm leading-relaxed text-ink-600 sm:text-base">
                      {ob.subtitle}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setAskingName(true)}
                        data-testid="welcome-start"
                        className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-ink-900)] px-6 py-3 text-xs font-bold text-[var(--color-canvas)]  transition hover:-translate-y-0.5 hover:bg-[var(--color-ink-800)]"
                      >
                        <span>{ob.ctaStart}</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        disabled={!backendOnline}
                        onClick={() => setSettingsSignal((n) => n + 1)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-paper)]/95 px-4 py-3 text-xs font-semibold text-ink-700 transition hover:bg-[var(--color-paper)] disabled:opacity-40"
                      >
                        <KeyRound className="h-3.5 w-3.5 text-ink-500" />
                        <span>{ob.ctaKey}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* MINI-STEP ANIMATO: CHIEDE IL NOME */
                  <form
                    onSubmit={handleSaveOnboardingName}
                    className="max-w-md space-y-4 rounded-2xl border border-white/80 bg-[var(--color-paper)]/90 p-6 shadow-lg backdrop-blur-md transition-all duration-300"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-gold-800)]">
                      <Sparkles className="h-4 w-4" />
                      <span>Syneso</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-[var(--color-ink-900)]">{ob.askNameTitle}</h3>
                      <p className="mt-1 text-xs text-ink-500">{ob.askNameSub}</p>
                    </div>
                    <input
                      autoFocus
                      required
                      maxLength={40}
                      data-testid="welcome-name"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder={ob.namePlaceholder}
                      className="w-full rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-3 text-sm font-medium text-[var(--color-ink-900)] transition focus:border-[var(--color-gold-700)] focus:ring-2 focus:ring-gold-700/15"
                    />
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAskingName(false)}
                        className="rounded-xl px-3 py-2 text-xs font-semibold text-ink-500 hover:bg-line"
                      >
                        {ob.backBtn}
                      </button>
                      <button
                        type="submit"
                        data-testid="welcome-continue"
                        disabled={nameDraft.trim().length < 2}
                        className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-ink-900)] px-5 py-2.5 text-xs font-bold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-800)] disabled:opacity-40"
                      >
                        {ob.continueBtn}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>

            {/* 3 CARD SOTTO */}
            <section className="grid gap-4 md:grid-cols-3">
              {[
                ["📖", ob.card1Title, ob.card1Body],
                ["💬", ob.card2Title, ob.card2Body],
                ["🗂", ob.card3Title, ob.card3Body],
              ].map(([emoji, title, body]) => (
                <article key={title} className="card-surface p-6 transition hover:border-gold-200">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-gold-100)] text-lg">
                    {emoji}
                  </div>
                  <h3 className="text-base font-bold text-[var(--color-ink-900)]">{title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-ink-600">{body}</p>
                </article>
              ))}
            </section>
          </main>
        </div>
      ) : items.length === 0 ? (
        /* UTENTE CON NOME SALVATO MA ANCORA 0 ESAMI (DENTRO APPSHELL) */
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-3xl border border-[var(--color-line)] bg-gradient-to-br from-[var(--color-sunken)] via-[var(--color-sunken)] to-[var(--color-gold-200)] p-8 sm:p-10">
            <div className="relative max-w-2xl space-y-4">
              <span className="inline-flex items-center rounded-full border border-gold-200 bg-paper px-3 py-1 text-xs font-semibold text-[var(--color-gold-800)]">
                {ob.pill}
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-[var(--color-ink-900)] sm:text-3xl">
                {ob.title}
              </h2>
              <p className="text-sm leading-relaxed text-ink-600">{ob.subtitle}</p>
              <button
                type="button"
                disabled={!backendOnline}
                onClick={() => setNewExamSignal((n) => n + 1)}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-ink-900)] px-5 py-2.5 text-xs font-bold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-800)] disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                {hv.firstExamCta}
              </button>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["📖", ob.card1Title, ob.card1Body],
              ["💬", ob.card2Title, ob.card2Body],
              ["🗂", ob.card3Title, ob.card3Body],
            ].map(([emoji, title, body]) => (
              <div key={title} className="card-surface p-6">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-gold-100)] text-base">
                  {emoji}
                </div>
                <h3 className="text-sm font-bold text-[var(--color-ink-900)]">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : isExamsView ? (
        /* VISTA: I MIEI ESAMI */
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map(({ exam, stats }) => {
              const dLeft = daysUntil(exam.exam_date);
              const pct =
                stats.planTotal > 0 ? Math.round((stats.planDone / stats.planTotal) * 100) : 0;
              const isConfirming = confirmDeleteId === exam.id;

              return (
                <article
                  key={exam.id}
                  className="card-surface flex flex-col justify-between p-5 transition hover:border-gold-700"
                >
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      {dLeft !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                            dLeft <= 7 && dLeft >= 0
                              ? "border border-[var(--color-danger)] bg-danger-soft text-danger"
                              : "border border-gold-200/70 bg-[var(--color-gold-100)]/60 text-[var(--color-ink-900)]"
                          }`}
                        >
                          <Calendar className="h-3 w-3" />
                          {dLeft >= 0 ? `${dLeft}${td.daysToExamSuffix}` : td.ended}
                        </span>
                      ) : (
                        <span className="rounded-md border border-line bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-600">
                          {td.freeStudy}
                        </span>
                      )}

                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => void handleDelete(exam.id)}
                            className="rounded-md bg-danger px-2 py-1 text-[10px] font-semibold text-[var(--color-canvas)] hover:bg-danger"
                          >
                            {td.deleteBtn}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-md bg-line px-2 py-1 text-[10px] font-semibold text-ink-600"
                          >
                            {td.cancelBtn}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(exam.id)}
                          title={td.deleteTitle}
                          className="rounded-lg p-1.5 text-line-strong transition hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <h4 className="text-base font-bold tracking-tight text-[var(--color-ink-900)]">
                      {exam.title}
                    </h4>
                    <p className="mt-1 line-clamp-1 text-xs text-ink-500">
                      {[exam.university, exam.degree_course, exam.professor]
                        .filter(Boolean)
                        .join(" • ") || td.noCourseDetails}
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-[var(--color-paper)] p-2.5 text-center">
                      <div>
                        <p className="text-[10px] font-medium uppercase text-ink-500">
                          {td.statFeynman}
                        </p>
                        <p className="mt-0.5 text-xs font-bold tabular-nums text-ink-800">
                          {stats.topicsMastered}/{stats.topicsTotal}
                        </p>
                      </div>
                      <div className="border-x border-line/70">
                        <p className="text-[10px] font-medium uppercase text-ink-500">
                          {td.statPlan}
                        </p>
                        <p className="mt-0.5 text-xs font-bold tabular-nums text-[var(--color-gold-800)]">
                          {pct}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase text-ink-500">
                          {td.statFsrs}
                        </p>
                        <p
                          className={`mt-0.5 text-xs font-bold tabular-nums ${
                            stats.dueCards > 0 ? "text-warn" : "text-ok"
                          }`}
                        >
                          {stats.dueCards > 0
                            ? `${stats.dueCards} ${td.cardWord}`
                            : td.inSync}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-[var(--color-gold-700)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/exam/?id=${exam.id}`}
                        onClick={() => setSavedActiveExamId(exam.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-ink-900)] px-3 py-2 text-xs font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-800)]"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        {td.openWorkspace}
                      </Link>
                      <Link
                        href={`/exam/?id=${exam.id}&tab=MOCK`}
                        onClick={() => setSavedActiveExamId(exam.id)}
                        className="rounded-xl border border-line bg-[var(--color-paper)] px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-sunken"
                      >
                        /30
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}

            <button
              type="button"
              onClick={() => setNewExamSignal((n) => n + 1)}
              className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-line-strong)] bg-[var(--color-paper)]/60 p-6 text-center transition hover:border-gold-700 hover:bg-[var(--color-paper)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-gold-100)] text-[var(--color-ink-900)]">
                <Plus className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-[var(--color-ink-900)]">{hv.addExamCard}</p>
              <p className="text-xs text-ink-500">{hv.addExamCardSub}</p>
            </button>
          </div>
        </div>
      ) : (
        /* VISTA PRINCIPALE: DASHBOARD HOME V2 */
        <div className="space-y-12">
          {timeline && <ExamTimeline timeline={timeline} insights={insights} />}

          {items.length > 1 && (
            <section className="border-t border-[var(--color-line)] pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                  {td.yourExams}
                </h3>
                <Link
                  href="/?view=exams"
                  className="text-xs font-semibold text-ink-700 underline underline-offset-4 hover:text-[var(--color-ink-900)]"
                >
                  {hv.seeAllExams}
                </Link>
              </div>
              <div className="divide-y divide-[var(--color-line)]">
                {items.map(({ exam, stats }) => {
                  const isCurrent = exam.id === activeExamId;
                  const dLeft = daysUntil(exam.exam_date);
                  return (
                    <div key={exam.id} className="flex items-center justify-between gap-4 py-3">
                      <button
                        type="button"
                        onClick={() => void handleSelectActiveExam(exam.id)}
                        className="flex min-w-0 flex-1 items-baseline gap-3 text-left"
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            isCurrent ? "bg-[var(--color-gold-700)]" : "bg-[var(--color-line-strong)]"
                          }`}
                        />
                        <span className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
                          {exam.title}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-500">
                          {dLeft !== null && dLeft >= 0
                            ? `${dLeft}${td.daysToExamSuffix}`
                            : td.freeStudy}
                        </span>
                      </button>
                      <span className="shrink-0 font-mono text-[11px] text-ink-500">
                        {stats.topicsMastered}/{stats.topicsTotal}
                      </span>
                      <Link
                        href={`/exam/?id=${exam.id}`}
                        onClick={() => setSavedActiveExamId(exam.id)}
                        className="shrink-0 text-xs font-semibold text-ink-700 underline underline-offset-4 hover:text-[var(--color-ink-900)]"
                      >
                        {td.openWorkspace}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] text-sm text-ink-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-ink-900" /> Loading...
        </div>
      }
    >
      <HomePageInner />
    </Suspense>
  );
}