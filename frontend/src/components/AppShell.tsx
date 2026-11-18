"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Home,
  Layers,
  MessagesSquare,
  PlayCircle,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { AboutDialog } from "@/components/shell/AboutDialog";
import { NewExamDrawer } from "@/components/shell/NewExamDrawer";
import { SettingsDialog } from "@/components/shell/SettingsDialog";
import { daysUntil } from "@/lib/dates";
import { setSavedActiveExamId } from "@/lib/shellStorage";
import { ImportProgressPanel } from "@/components/ImportProgressPanel";
import { useOnImportFinished } from "@/components/ImportsProvider";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLanguage } from "@/components/LanguageProvider";
import { SearchModal } from "@/components/SearchModal";
import { SynesoLockup, SynesoSymbol } from "@/components/SynesoLogo";
import {
  AppSettings,
  checkHealth,
  ExamOverviewItem,
  getAppSettings,
  getExamsOverview,
} from "@/lib/api";

export type ShellSection =
  | "HOME"
  | "EXAMS"
  | "STUDY"
  | "FEYNMAN"
  | "FLASHCARDS"
  | "MOCK"
  | "ANALYTICS"
  | "ARCHIVE";

interface AppShellProps {
  activeSection: ShellSection;
  pageTitle: string;
  pageSubtitle?: string;
  /** La home scrive da sé la propria testata: qui il titolo resta solo come
   *  nome della pagina, e la barra tiene le azioni. */
  hidePageTitle?: boolean;
  activeExamId?: string | null;
  onActiveExamChange?: (examId: string) => void;
  onSelectSection?: (section: ShellSection) => void;
  onDataChanged?: () => void;
  onUserNameChange?: (name: string) => void;
  openNewExamSignal?: number;
  openSettingsSignal?: number;
  openAboutSignal?: number;
  hideShell?: boolean;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  activeSection,
  pageTitle,
  pageSubtitle,
  hidePageTitle = false,
  activeExamId,
  onActiveExamChange,
  onSelectSection,
  onDataChanged,
  onUserNameChange,
  openNewExamSignal,
  openSettingsSignal,
  openAboutSignal,
  hideShell = false,
  headerExtra,
  children,
}: AppShellProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const ts = t.shell;

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [examsOverview, setExamsOverview] = useState<ExamOverviewItem[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);



  const refreshShell = useCallback(async () => {
    const online = await checkHealth();
    setBackendOnline(online);
    if (!online) return;
    const [overview, cfg] = await Promise.all([
      getExamsOverview().catch(() => [] as ExamOverviewItem[]),
      getAppSettings().catch(() => null),
    ]);
    setExamsOverview(overview);
    if (cfg) setAppSettings(cfg);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setSidebarCollapsed(localStorage.getItem("syneso_sidebar_collapsed") === "1");
      } catch {}
      void refreshShell();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshShell]);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("syneso_sidebar_collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    if (!openNewExamSignal) return;
    const timer = setTimeout(() => setDrawerOpen(true), 0);
    return () => clearTimeout(timer);
  }, [openNewExamSignal]);

  useEffect(() => {
    if (!openSettingsSignal) return;
    const timer = setTimeout(() => setSettingsOpen(true), 0);
    return () => clearTimeout(timer);
  }, [openSettingsSignal]);

  useEffect(() => {
    if (!openAboutSignal) return;
    const timer = setTimeout(() => setAboutOpen(true), 0);
    return () => clearTimeout(timer);
  }, [openAboutSignal]);

  const currentExamItem =
    examsOverview.find((item) => item.exam.id === activeExamId) ?? examsOverview[0] ?? null;
  const resolvedExamId = currentExamItem?.exam.id ?? null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (!resolvedExamId) return;
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setSwitcherOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resolvedExamId]);

  function navigateSection(section: ShellSection) {
    if (
      onSelectSection &&
      (section === "STUDY" ||
        section === "FEYNMAN" ||
        section === "FLASHCARDS" ||
        section === "MOCK" ||
        section === "ANALYTICS")
    ) {
      onSelectSection(section);
      return;
    }
    if (section === "HOME") {
      router.push("/");
      return;
    }
    if (section === "EXAMS") {
      router.push("/?view=exams");
      return;
    }
    if (section === "ARCHIVE") {
      router.push("/archive/");
      return;
    }
    if (!resolvedExamId) {
      setDrawerOpen(true);
      return;
    }
    setSavedActiveExamId(resolvedExamId);
    router.push(`/exam/?id=${resolvedExamId}&tab=${section}`);
  }

  function handleSwitchExam(examId: string) {
    setSavedActiveExamId(examId);
    setSwitcherOpen(false);
    if (onActiveExamChange) {
      onActiveExamChange(examId);
      return;
    }
    if (activeSection === "HOME" || activeSection === "EXAMS") {
      router.push(`/?exam=${examId}`);
    } else if (activeSection === "ARCHIVE") {
      router.push(`/archive/`);
    } else {
      router.push(`/exam/?id=${examId}&tab=${activeSection}`);
    }
  }



  useOnImportFinished((job) => {
    if (job.status !== "completed") return;
    void refreshShell();
    onDataChanged?.();
  });

  function handleOpenImportedExam(examId: string) {
    setSavedActiveExamId(examId);
    router.push(`/exam/?id=${examId}`);
  }







  const dueCount = currentExamItem?.stats.dueCards ?? 0;
  const activeDaysLeft = currentExamItem ? daysUntil(currentExamItem.exam.exam_date) : null;

  const navBtnClass = (sec: ShellSection) =>
    `flex w-full items-center justify-between rounded-[11px] px-3 py-2.5 text-[13px] transition ${
      activeSection === sec
        ? "bg-[var(--color-gold-100)] font-semibold text-[var(--color-ink-900)]"
        : "font-medium text-ink-600 hover:bg-[var(--color-sunken)] hover:text-ink-900"
    }`;

  // Icone disegnate, non emoji: un'emoji cambia disegno su ogni sistema, non
  // prende il colore del testo e non si allinea con le altre (DESIGN.md §8).
  const navItems: { id: ShellSection; icon: LucideIcon; label: string; badge?: number }[] = [
    { id: "HOME", icon: Home, label: ts.navHome },
    { id: "EXAMS", icon: GraduationCap, label: ts.navExams },
    { id: "STUDY", icon: BookOpen, label: ts.navStudy },
    { id: "FEYNMAN", icon: MessagesSquare, label: ts.navFeynman },
    { id: "FLASHCARDS", icon: Layers, label: ts.navFlashcards, badge: dueCount > 0 ? dueCount : undefined },
    { id: "MOCK", icon: PlayCircle, label: ts.navMock },
    { id: "ANALYTICS", icon: BarChart3, label: ts.navAnalytics },
    { id: "ARCHIVE", icon: Archive, label: ts.navArchive },
  ];

  const modals = (
    <>
      {resolvedExamId && (
        <SearchModal
          open={searchOpen}
          examId={resolvedExamId}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {aboutOpen && (
        <AboutDialog
          appVersion={appSettings?.app_version}
          onClose={() => setAboutOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          settings={appSettings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated, userName) => {
            setAppSettings(updated);
            onUserNameChange?.(userName);
          }}
        />
      )}

      {drawerOpen && (
        <NewExamDrawer
          backendOnline={backendOnline === true}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );

  if (hideShell) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)]">
        {children}
        {modals}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink-900)]">
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          title={ts.showMenu}
          className="fixed left-0 top-1/2 z-40 hidden h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-[var(--color-line-strong)] bg-[var(--color-paper)] text-ink-500 shadow-md transition hover:w-6 hover:border-gold-700 hover:text-[var(--color-ink-900)] lg:flex"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
      <ImportProgressPanel onOpenExam={handleOpenImportedExam} />
      <aside className={`relative sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-[var(--color-line)] bg-[var(--color-sunken)] px-3.5 py-5 ${sidebarCollapsed ? "lg:hidden" : "lg:flex"}`}>
        <button
          type="button"
          onClick={toggleSidebar}
          title={ts.hideMenu}
          className="absolute -right-3 top-1/2 z-40 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-line-strong)] bg-[var(--color-paper)] text-ink-500  transition hover:border-gold-700 hover:text-[var(--color-ink-900)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="space-y-6">
          <Link href="/" className="flex items-center px-2.5 text-ink-900" aria-label="Syneso">
            <SynesoLockup className="h-7 w-auto" />
          </Link>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateSection(item.id)}
                className={navBtnClass(item.id)}
              >
                <span className="flex items-center gap-2.5">
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span className="rounded-full bg-[var(--color-gold-100)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--color-gold-800)]">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="relative px-1 pt-1">
            <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
              {ts.activeExamLabel}
            </p>
            <button
              type="button"
              onClick={() => examsOverview.length > 0 && setSwitcherOpen((prev) => !prev)}
              className="w-full rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-3 py-2.5 text-left transition hover:border-gold-700"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-[var(--color-ink-900)]">
                  {currentExamItem ? currentExamItem.exam.title : ts.noActiveExam}
                </span>
                {examsOverview.length > 1 && (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                )}
              </div>
              {currentExamItem && (
                <p className="mt-0.5 text-[11px] text-ink-500">
                  {[
                    currentExamItem.exam.exam_date,
                    activeDaysLeft !== null && activeDaysLeft >= 0
                      ? `${activeDaysLeft}${ts.daysLeftShort}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" • ") || t.dashboard.freeStudy}
                </p>
              )}
            </button>

            {switcherOpen && examsOverview.length > 0 && (
              <div className="absolute left-1 right-1 z-40 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-paper)] p-1.5 shadow-xl">
                {examsOverview.map((row) => (
                  <button
                    key={row.exam.id}
                    type="button"
                    onClick={() => handleSwitchExam(row.exam.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      row.exam.id === resolvedExamId
                        ? "bg-[var(--color-gold-100)] font-bold text-[var(--color-ink-900)]"
                        : "text-ink-700 hover:bg-sunken"
                    }`}
                  >
                    <span className="truncate">{row.exam.title}</span>
                    {row.stats.dueCards > 0 && (
                      <span className="ml-2 shrink-0 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold text-warn">
                        {row.stats.dueCards}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1 border-t border-[var(--color-line)] pt-3 text-[13px] font-medium text-ink-600">
          <div
            className={`mb-1.5 flex items-center gap-2 rounded-[11px] border px-3 py-2 text-[11px] font-semibold ${
              backendOnline === true
                ? "border-ok-soft bg-ok-soft/70 text-ok"
                : backendOnline === false
                ? "border-danger-soft bg-danger-soft/70 text-danger"
                : "border-line bg-sunken text-ink-500"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                backendOnline === true
                  ? "bg-[var(--color-ok)]"
                  : backendOnline === false
                  ? "bg-[var(--color-danger)]"
                  : "animate-pulse bg-ink-400"
              }`}
            />
            <span className="truncate">
              {backendOnline === true
                ? ts.cloudActive
                : backendOnline === false
                ? ts.cloudOffline
                : t.header.connecting}
            </span>
          </div>
          <button
            type="button"
            data-testid="open-settings"
            onClick={() => setSettingsOpen(true)}
            disabled={!backendOnline}
            className="flex w-full items-center gap-2.5 rounded-[11px] px-3 py-2 transition hover:bg-[var(--color-sunken)] hover:text-ink-900 disabled:opacity-40"
          >
            <SettingsIcon className="h-4 w-4 shrink-0 text-ink-500" />
            <span>{ts.settingsBtn}</span>
          </button>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-[11px] px-3 py-2 transition hover:bg-[var(--color-sunken)] hover:text-ink-900"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--color-gold-800)]" />
            <span>{ts.helpBtn}</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--color-sunken)] bg-[var(--color-canvas)]/90 px-6 py-3.5 backdrop-blur-md sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="lg:hidden">
                <SynesoSymbol className="h-8 w-8" />
              </Link>
              {hidePageTitle ? (
                <h1 className="sr-only">{pageTitle}</h1>
              ) : (
                <div>
                  <h1 className="line-clamp-2 font-title text-[21px] leading-tight text-[var(--color-ink-900)] sm:truncate sm:text-[27px]">
                    {pageTitle}
                  </h1>
                  {pageSubtitle && <p className="text-xs text-ink-500">{pageSubtitle}</p>}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {resolvedExamId && (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="hidden items-center gap-2 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-2 text-xs text-ink-500 transition hover:border-gold-700 md:flex md:w-56 xl:w-64"
                >
                  <Search className="h-3.5 w-3.5 text-ink-500" />
                  <span className="flex-1 truncate text-left">{ts.searchPlaceholder}</span>
                  <kbd className="rounded bg-line px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                    ⌘K
                  </kbd>
                </button>
              )}

              {backendOnline === false && (
                <span className="hidden items-center gap-1.5 rounded-full border border-[var(--color-danger)] bg-danger-soft px-3 py-1.5 text-[11px] font-semibold text-danger sm:inline-flex">
                  <span className="h-2 w-2 rounded-full bg-[var(--color-danger)]" />
                  {ts.cloudOffline}
                </span>
              )}

              <ThemeToggle />

              <LanguageToggle />

              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                disabled={!backendOnline}
                data-testid="open-new-exam"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-ink-900)] px-4 py-2 text-xs font-semibold text-[var(--color-canvas)]  transition hover:bg-[var(--color-ink-800)] disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t.header.newExam}</span>
              </button>
            </div>
          </header>

          {/*
            Barra di sezione: la navigazione (solo su schermi stretti, dove la barra
            laterale è nascosta) e le azioni della sezione aperta. Stanno qui e non
            nell'intestazione, così l'intestazione resta identica in ogni sezione.
          */}
          <div
            className={`flex items-center gap-3 border-b border-[var(--color-sunken)] bg-[var(--color-canvas)]/90 px-6 py-2 text-xs backdrop-blur-md sm:px-8 ${
              headerExtra ? "" : "lg:hidden"
            }`}
          >
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto lg:hidden">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateSection(item.id)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 font-semibold ${
                    activeSection === item.id
                      ? "bg-[var(--color-gold-100)] text-[var(--color-ink-900)]"
                      : "text-ink-600"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            {headerExtra && (
              <div className="ml-auto flex shrink-0 items-center gap-2">{headerExtra}</div>
            )}
          </div>
        </div>

        {backendOnline && appSettings && !appSettings.has_api_key && (
          <div className="mx-6 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-warn)] bg-warn-soft/90 px-4 py-3 text-xs text-[var(--color-warn)] sm:mx-8">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
              <span>
                <strong>{t.banner.missingKeyPrefix}</strong> {t.banner.missingKeyBody}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg bg-[var(--color-warn-fill)] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-warn"
            >
              {t.banner.configureNow}
            </button>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1280px] flex-1 p-6 sm:p-8">{children}</main>
      </div>

      {modals}
    </div>
  );
}