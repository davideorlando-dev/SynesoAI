
"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  AlertCircle,
  Calendar,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { AppShell, ShellSection } from "@/components/AppShell";
import { KATEX_OPTIONS, normalizeMathDelimiters } from "@/lib/mathDelimiters";
import { clearSavedActiveExam, setSavedActiveExamId } from "@/lib/shellStorage";
import { useImports, useOnImportFinished } from "@/components/ImportsProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { AnalyticsView } from "@/components/exam/AnalyticsView";
import { CourseContextCard } from "@/components/exam/CourseContextCard";
import { FeynmanView } from "@/components/exam/FeynmanView";
import { FlashcardsView } from "@/components/exam/FlashcardsView";
import { MockExamView } from "@/components/exam/MockExamView";
import { PlanTab } from "@/components/exam/PlanTab";
import { TopicMap } from "@/components/exam/TopicMap";
import { TopicHeader } from "@/components/exam/TopicHeader";
import { TopicNotesPanel } from "@/components/exam/TopicNotesPanel";
import { PdfPane } from "@/components/exam/PdfPane";
import { TopicsTab } from "@/components/exam/TopicsTab";
import { TutorPane } from "@/components/exam/TutorPane";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useExamAnnotations } from "@/hooks/useExamAnnotations";
import { useFeynman } from "@/hooks/useFeynman";
import { useFlashcards } from "@/hooks/useFlashcards";
import { useMockExam } from "@/hooks/useMockExam";
import { useTopicNotes } from "@/hooks/useTopicNotes";
import { ExamMainTab, examSectionSummary } from "@/lib/examSections";
import { TopicPriority } from "@/lib/topicPriority";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  ApiError,
  askTopicTutor,
  createCustomTopic,
  ExamAnalyticsResponse,
  getCalendarIcsUrl,
  getExamAnalytics,
  getExportAnkiUrl,
  getExportNotesUrl,
  getRoadmap,
  Highlight,
  HighlightColor,
  replanExam,
  RoadmapResponse,
  togglePlanItem,
  Topic,
  updateTopicSettings,
} from "@/lib/api";

const HL_CLASSES: Record<HighlightColor, string> = {
  yellow: "bg-[var(--color-mark-yellow)] text-[var(--color-on-mark)] rounded px-0.5 cursor-pointer hover:bg-[var(--color-mark-yellow)]/80",
  green: "bg-[var(--color-mark-green)] text-[var(--color-on-mark)] rounded px-0.5 cursor-pointer hover:bg-[var(--color-mark-green)]/80",
  pink: "bg-[var(--color-mark-pink)] text-[var(--color-on-mark)] rounded px-0.5 cursor-pointer hover:bg-[var(--color-mark-pink)]/80",
  blue: "bg-[var(--color-mark-blue)] text-[var(--color-on-mark)] rounded px-0.5 cursor-pointer hover:bg-[var(--color-mark-blue)]/80",
};

function getSavedTopicId(examId: string): string | null {
  if (typeof window === "undefined" || !examId) return null;
  try { return localStorage.getItem(`syneso_active_topic_${examId}`); } catch { return null; }
}
function saveTopicId(examId: string, topicId: string): void {
  if (typeof window === "undefined" || !examId) return;
  try { localStorage.setItem(`syneso_active_topic_${examId}`, topicId); } catch {}
}


function resolveTabParam(raw: string | null): ExamMainTab {
  if (raw === "FEYNMAN" || raw === "FLASHCARDS" || raw === "MOCK" || raw === "ANALYTICS") {
    return raw;
  }
  return "STUDY";
}

function ExamWorkspaceInner() {
  const { lang, t } = useLanguage();
  const errorMessage = useErrorMessage();
  const { startDocumentsImport } = useImports();
  const te = t.exam;
  const tmap = t.topicMap;
  const isEn = lang === "en";
  const router = useRouter();
  const searchParams = useSearchParams();

  const examId = searchParams.get("id") || "";
  const tabParam = resolveTabParam(searchParams.get("tab"));
  const topicParam = searchParams.get("topic") || searchParams.get("topicId");
  const docParam = searchParams.get("doc") || searchParams.get("docId");
  const pageParam = searchParams.get("page");

  const [mainTab, setMainTab] = useState<ExamMainTab>(tabParam);

  const [data, setData] = useState<RoadmapResponse | null>(null);
  const dataRef = useRef<RoadmapResponse | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  const [analytics, setAnalytics] = useState<ExamAnalyticsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [examGone, setExamGone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  // ?panel=plan apre direttamente il piano: è il link che la home usa per
  // "sposta il piano", e senza questo porterebbe a un pannello sbagliato.
  const [sidebarTab, setSidebarTab] = useState<"TOPICS" | "PLAN">(
    searchParams.get("panel")?.toUpperCase() === "PLAN" ? "PLAN" : "TOPICS"
  );
  const [topicsPanelOpen, setTopicsPanelOpen] = useState(true);
  const [pdfJumpKey, setPdfJumpKey] = useState(0);
  const [rightPane, setRightPane] = useState<"assist" | "pdf">(docParam ? "pdf" : "assist");

  const [savingNewTopic, setSavingNewTopic] = useState(false);
  const [updatingTopicId, setUpdatingTopicId] = useState<string | null>(null);

  const [focusMode, setFocusMode] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [widePdf, setWidePdf] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [replanning, setReplanning] = useState(false);



  const notesContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const [removeHlPopup, setRemoveHlPopup] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [tutorInput, setTutorInput] = useState("");
  const [askingTutor, setAskingTutor] = useState(false);
  const topicIds = useMemo(() => (data ? data.topics.map((tp) => tp.id) : null), [data]);
  const {
    highlightsByTopic: userHighlightsByTopic,
    tutorThreads,
    addHighlight,
    removeHighlight,
    appendTutorMessage,
    clearTutorThread,
  } = useExamAnnotations(examId, topicIds, setActionError);

  const {
    recordingTarget,
    recordingSeconds,
    transcribingTarget,
    toggleVoiceRecording,
  } = useVoiceRecorder({
    micErrorMessage: te.micError,
    onError: (msg) => setActionError(msg),
    onTranscribed: (target, text) => {
      if (target === "FEYNMAN") {
        feynman.appendToExplanation(text);
      } else if (target.startsWith("MOCK:")) {
        mock.appendToAnswer(target.slice(5), text);
      }
    },
  });


  const notes = useTopicNotes({
    onError: setActionError,
    onNotesChanged: async (topicId) => {
      await loadAll(topicId);
      await flashcards.reload();
      await loadAnalytics();
    },
    onSynthesisStarted: () => {
      setSelectionPopup(null);
      setActionError(null);
      flashcards.clearNotice();
    },
  });

  const feynman = useFeynman({
    onError: setActionError,
    onEvaluated: async (topicId) => {
      await loadAll(topicId);
      await flashcards.reload();
      await loadAnalytics();
    },
  });

  const flashcards = useFlashcards({
    examId,
    shortcutsActive: mainTab === "FLASHCARDS",
    onError: setActionError,
    onReviewed: () => loadAnalytics(),
  });

  const mock = useMockExam({
    examId,
    timerActive: mainTab === "MOCK",
    onError: setActionError,
    onGraded: async () => {
      await loadAll(selectedTopic?.id);
      await flashcards.reload();
      await loadAnalytics();
    },
  });

  useEffect(() => {
    if (mainTab !== "STUDY") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        setFocusMode((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mainTab]);

  useEffect(() => {
    if (!selectionPopup && !removeHlPopup) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-selection-toolbar="true"]')) return;
      setSelectionPopup(null);
      setRemoveHlPopup(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectionPopup(null);
        setRemoveHlPopup(null);
      }
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectionPopup, removeHlPopup]);

  const loadAnalytics = useCallback(async () => {
    if (!examId) return;
    const res = await getExamAnalytics(examId);
    setAnalytics(res);
  }, [examId]);

  const loadAll = useCallback(
    async (keepTopicId?: string) => {
      try {
        setLoadError(null);
        const roadmap = await getRoadmap(examId);
        setData(roadmap);
        setSelectedDocId((prev) => docParam || prev || roadmap.documents[0]?.id || null);
        if (pageParam) {
          const parsedPage = Number(pageParam);
          if (Number.isFinite(parsedPage) && parsedPage >= 1) {
            setPdfPage(parsedPage);
          }
        }

        const activeList = roadmap.topics.filter((tp) => !tp.excluded);
        const pool = activeList.length > 0 ? activeList : roadmap.topics;

        if (pool.length > 0) {
          const preferred = keepTopicId || topicParam || getSavedTopicId(examId);
          const nextTopic =
            (preferred && roadmap.topics.find((tp) => tp.id === preferred && !tp.excluded)) ||
            pool[0];
          setSelectedTopic(nextTopic);
          saveTopicId(examId, nextTopic.id);
          await feynman.loadForTopic(nextTopic.id);
        } else {
          setSelectedTopic(null);
        }
      } catch (err) {
        // Un esame eliminato non torna: si dimentica, invece di riprovare a caricarlo.
        if (err instanceof ApiError && err.code === "exam_not_found") {
          clearSavedActiveExam(examId);
          setExamGone(true);
        }
        setLoadError(errorMessage(err));
      }
    },
    [examId, docParam, pageParam, topicParam, feynman.loadForTopic, errorMessage]
  );

  useEffect(() => {
    if (!examId) return;
    setSavedActiveExamId(examId);
    notes.abortAndReset();
    const timer = setTimeout(() => {
      setSelectionPopup(null);
      setRemoveHlPopup(null);
      flashcards.setOriginFilter("ALL");
      flashcards.setTopicFilter(
        tabParam === "FLASHCARDS" && topicParam ? topicParam : "ALL"
      );
      mock.resetSession();
      void loadAll(topicParam || undefined);
      void mock.reloadHistory();
      void loadAnalytics();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => {
    const timer = setTimeout(() => setMainTab(tabParam), 0);
    return () => clearTimeout(timer);
  }, [tabParam]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (topicParam) {
        if (tabParam === "FLASHCARDS") {
          flashcards.setTopicFilter(topicParam);
        }
        if (dataRef.current?.topics) {
          const found = dataRef.current.topics.find((tp) => tp.id === topicParam && !tp.excluded);
          if (found) {
            setSelectedTopic(found);
            void feynman.loadForTopic(found.id);
          }
        }
      }
      if (docParam) {
        setSelectedDocId(docParam);
        setRightPane("pdf");
      }
      if (pageParam) {
        const pNum = Number(pageParam);
        if (Number.isFinite(pNum) && pNum >= 1) setPdfPage(pNum);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [tabParam, topicParam, docParam, pageParam, feynman.loadForTopic]);

  function selectTopic(topic: Topic) {
    saveTopicId(examId, topic.id);
    notes.abortAndReset();
    setSelectionPopup(null);
    setSelectedTopic(topic);
    flashcards.clearNotice();
    setActionError(null);
    void feynman.loadForTopic(topic.id);
  }

  function handleSwitchSection(section: ShellSection) {
    setSelectionPopup(null);
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
    if (section !== "STUDY") setFocusMode(false);
    setMainTab(section);
    router.replace(`/exam/?id=${encodeURIComponent(examId)}&tab=${section}`, { scroll: false });
    if (section === "FLASHCARDS") void flashcards.reload();
    if (section === "ANALYTICS") void loadAnalytics();
  }

  function openPdfAt(docId: string | null | undefined, page: number) {
    if (docId) setSelectedDocId(docId);
    setPdfPage(page);
    setPdfJumpKey((k) => k + 1);
    setRightPane("pdf");
    setMainTab("STUDY");
    setFocusMode(false);
  }

  /** Crea l'argomento e dice al modulo se è andata: lo svuota solo in caso affermativo. */
  async function createCustomTopicFromSidebar(
    title: string,
    description: string,
    priority: TopicPriority
  ): Promise<boolean> {
    setSavingNewTopic(true);
    setActionError(null);
    try {
      const res = await createCustomTopic(examId, {
        title,
        description: description || undefined,
        priority,
      });
      await loadAll(res.topic.id);
      await feynman.loadForTopic(res.topic.id);
      await loadAnalytics();
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    } finally {
      setSavingNewTopic(false);
    }
  }

  async function handleToggleExcludeTopic(topic: Topic, excluded: boolean) {
    setUpdatingTopicId(topic.id);
    setActionError(null);
    try {
      await updateTopicSettings(topic.id, { excluded });
      const keepId =
        excluded && selectedTopic?.id === topic.id
          ? undefined
          : !excluded
          ? topic.id
          : selectedTopic?.id;
      await loadAll(keepId);
      await flashcards.reload();
      await loadAnalytics();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setUpdatingTopicId(null);
    }
  }

  async function handleChangeTopicPriority(
    topic: Topic,
    priority: "CORE" | "IMPORTANT" | "DETAIL"
  ) {
    setUpdatingTopicId(topic.id);
    setActionError(null);
    try {
      await updateTopicSettings(topic.id, { priority });
      await loadAll(topic.id);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setUpdatingTopicId(null);
    }
  }

  function handleNotesMouseUp() {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelectionPopup(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3 || !notesContainerRef.current) {
        setSelectionPopup(null);
        return;
      }
      const anchorNode = sel.anchorNode;
      if (anchorNode && !notesContainerRef.current.contains(anchorNode)) {
        setSelectionPopup(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setSelectionPopup(null);
        return;
      }
      const left = Math.max(175, Math.min(window.innerWidth - 175, rect.left + rect.width / 2));
      const top = Math.max(76, rect.top - 56);
      setRemoveHlPopup(null);
      setSelectionPopup({ text: text.slice(0, 1200), top, left });
    }, 10);
  }

  function handleAddUserHighlight(color: HighlightColor) {
    if (!selectedTopic || !selectionPopup) return;
    const cleanText = selectionPopup.text.replace(/\s+/g, " ").trim();
    if (cleanText.length < 3) return;
    void addHighlight(selectedTopic.id, cleanText, color);
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleRemoveUserHighlight(hlId: string) {
    if (!selectedTopic) return;
    void removeHighlight(selectedTopic.id, hlId);
    setRemoveHlPopup(null);
  }

  function handleNotesClick(e: React.MouseEvent<HTMLDivElement>) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const mark = (e.target as HTMLElement | null)?.closest("mark[data-user-hl]");
    if (!mark) {
      setRemoveHlPopup(null);
      return;
    }
    const hlId = mark.getAttribute("data-user-hl");
    if (!hlId) return;
    const rect = mark.getBoundingClientRect();
    setRemoveHlPopup({
      id: hlId,
      top: Math.max(76, rect.top - 44),
      left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2)),
    });
  }

  async function runTutorQuery(question: string, selectedText?: string) {
    if (!selectedTopic || !question.trim()) return;
    const tid = selectedTopic.id;
    setAskingTutor(true);
    setActionError(null);
    setSelectionPopup(null);
    setRightPane("assist");
    window.getSelection()?.removeAllRanges();

    try {
      const res = await askTopicTutor(tid, question.trim(), selectedText);
      appendTutorMessage(tid, {
        id: res.id,
        question: question.trim(),
        selectedText,
        answerMarkdown: res.answer_markdown,
        citations: res.citations || [],
      });
      if (!selectedText) setTutorInput("");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setAskingTutor(false);
    }
  }

  async function handleCreateCardFromSelection() {
    if (!selectedTopic || !selectionPopup) return;
    const text = selectionPopup.text;
    setActionError(null);
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
    await flashcards.createFromText(selectedTopic.id, text);
  }

  useOnImportFinished((job) => {
    if (job.status === "completed" && job.exam_id === examId) {
      void loadAll(selectedTopic?.id);
    }
  });

  async function handleAddPdfs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setActionsMenuOpen(false);
    setUploadingDocs(true);
    setActionError(null);
    try {
      // L'import prosegue in background; la pagina si aggiorna quando termina.
      await startDocumentsImport(examId, files, lang);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setUploadingDocs(false);
      e.target.value = "";
    }
  }

  async function handleTogglePlan(itemId: string) {
    try {
      await togglePlanItem(itemId);
      await loadAll(selectedTopic?.id);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  /** Ripianifica e restituisce il messaggio da mostrare, o null se è fallita. */
  async function replanWithHours(hours: string): Promise<string | null> {
    setReplanning(true);
    setActionError(null);
    try {
      const normalized = Number(hours.replace(",", "."));
      const parsedHrs = Math.min(
        12,
        Math.max(0.5, Number.isFinite(normalized) && normalized > 0 ? normalized : 2)
      );
      const res = await replanExam(examId, lang, parsedHrs);
      await loadAll(selectedTopic?.id);
      await loadAnalytics();
      const perDay = res.daily_hours ?? parsedHrs;
      return lang === "en" ? `Plan updated (${perDay} h/d)` : `Piano aggiornato (${perDay} h/g)`;
    } catch (err) {
      setActionError(errorMessage(err));
      return null;
    } finally {
      setReplanning(false);
    }
  }

  function handleSynthesize(force = false) {
    if (!selectedTopic) return;
    void notes.synthesize(selectedTopic.id, Boolean(selectedTopic.notes_markdown), force);
  }

  async function handleFeynman(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTopic) return;
    setActionError(null);
    await feynman.submit(selectedTopic.id);
  }

  const displayedNotes = notes.synthesizing
    ? notes.streamingText
    : selectedTopic?.notes_markdown || "";

  const activeUserHighlights = useMemo(
    () => (selectedTopic ? userHighlightsByTopic[selectedTopic.id] || [] : []),
    [selectedTopic, userHighlightsByTopic]
  );

  const renderedNotesNode = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-lg font-bold text-[var(--color-ink-900)]">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 border-l-2 border-[var(--color-gold-700)] pl-3 text-[15px] font-bold text-[var(--color-ink-900)]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-3 text-sm font-bold text-ink-800">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1.5 pl-5 text-ink-700">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1.5 pl-5 text-ink-700">{children}</ol>
          ),
          p: ({ children }) => <p className="my-2 text-ink-700">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--color-ink-900)]">{children}</strong>
          ),
        }}
      >
        {normalizeMathDelimiters(displayedNotes)}
      </ReactMarkdown>
    ),
    [displayedNotes]
  );

  useEffect(() => {
    const container = notesContainerRef.current;
    if (!container || notes.editing || notes.synthesizing) return;

    container.querySelectorAll("mark[data-user-hl]").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });

    for (const hl of activeUserHighlights) {
      const target = hl.text.replace(/\s+/g, " ").trim();
      if (!target) continue;

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const nodes: { node: Text; start: number; end: number }[] = [];
      let raw = "";
      let cur: Node | null;
      while ((cur = walker.nextNode())) {
        const txtNode = cur as Text;
        const val = txtNode.nodeValue || "";
        if (!val) continue;
        nodes.push({ node: txtNode, start: raw.length, end: raw.length + val.length });
        raw += val;
      }

      const normChars: string[] = [];
      const normToRaw: number[] = [];
      let prevSpace = true;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (/\s/.test(ch)) {
          if (!prevSpace) {
            normChars.push(" ");
            normToRaw.push(i);
            prevSpace = true;
          }
        } else {
          normChars.push(ch);
          normToRaw.push(i);
          prevSpace = false;
        }
      }
      const normText = normChars.join("");
      const normIdx = normText.indexOf(target);
      if (normIdx === -1) continue;

      const rawStart = normToRaw[normIdx];
      const lastNormIdx = normIdx + target.length - 1;
      const rawEnd = (normToRaw[lastNormIdx] ?? rawStart) + 1;

      const slices: { node: Text; s: number; e: number }[] = [];
      for (const item of nodes) {
        if (item.end <= rawStart || item.start >= rawEnd) continue;
        const s = Math.max(0, rawStart - item.start);
        const e = Math.min(item.node.length, rawEnd - item.start);
        if (s < e) slices.push({ node: item.node, s, e });
      }

      for (let i = slices.length - 1; i >= 0; i--) {
        const { node, s, e } = slices[i];
        try {
          const range = document.createRange();
          range.setStart(node, s);
          range.setEnd(node, e);
          const mark = document.createElement("mark");
          mark.setAttribute("data-user-hl", hl.id);
          mark.className = HL_CLASSES[hl.color];
          mark.title = te.removeHighlight;
          range.surroundContents(mark);
        } catch {
          // ignore cross-element edge
        }
      }
    }
  }, [renderedNotesNode, activeUserHighlights, notes.editing, notes.synthesizing, te.removeHighlight]);

  if (!examId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-sunken)] p-6 text-center">
        <p className="text-sm font-semibold text-ink-800">{te.noExamSelected}</p>
        <Link href="/" className="rounded-xl bg-[var(--color-ink-900)] px-4 py-2 text-xs font-semibold text-[var(--color-canvas)]">
          {te.backHome}
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-sunken)] p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-ink-800">{loadError}</p>
        <div className="flex gap-2">
          {!examGone && (
            <button
              onClick={() => loadAll()}
              className="rounded-xl bg-[var(--color-ink-900)] px-4 py-2 text-xs font-semibold text-[var(--color-canvas)] hover:bg-[var(--color-ink-900)]"
            >
              {te.retry}
            </button>
          )}
          <Link
            href="/"
            className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-[var(--color-sunken)]"
          >
            {te.backHome}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-sunken)] text-sm text-ink-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--color-gold-800)]" /> {te.loading}
      </div>
    );
  }

  const activeTopics = data.topics.filter((tp) => !tp.excluded);
  const excludedTopics = data.topics.filter((tp) => tp.excluded);

  let highlights: Highlight[] = [];
  if (selectedTopic?.highlights_json) {
    try {
      highlights = JSON.parse(selectedTopic.highlights_json);
    } catch {
      highlights = [];
    }
  }

  let prerequisiteTopics: Topic[] = [];
  if (selectedTopic?.prerequisites_json) {
    try {
      const prereqIds: string[] = JSON.parse(selectedTopic.prerequisites_json);
      prerequisiteTopics = activeTopics.filter((tp) => prereqIds.includes(tp.id));
    } catch {
      prerequisiteTopics = [];
    }
  }

  const completedCount = data.plan.filter((p) => p.completed).length;
  const progressPct =
    data.plan.length > 0 ? Math.round((completedCount / data.plan.length) * 100) : 0;

  const masteredCount = activeTopics.filter((tp) => tp.status === "MASTERED").length;
  const activeTutorMessages = selectedTopic ? tutorThreads[selectedTopic.id] || [] : [];

  const sectionLabel =
    mainTab === "STUDY"
      ? t.shell.navStudy
      : mainTab === "FEYNMAN"
      ? t.shell.navFeynman
      : mainTab === "FLASHCARDS"
      ? t.shell.navFlashcards
      : mainTab === "MOCK"
      ? t.shell.navMock
      : t.shell.navAnalytics;

  const headerActions = (
    <div className="relative flex items-center gap-2">
      {mainTab === "STUDY" && (
        <>
          <button
            type="button"
            onClick={() => setTopicsPanelOpen((prev) => !prev)}
            title={topicsPanelOpen ? te.hideTopics : te.showTopics}
            className={`hidden shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition lg:inline-flex ${
              topicsPanelOpen
                ? "border-[var(--color-line)] bg-[var(--color-paper)] text-ink-700 hover:bg-[var(--color-sunken)]"
                : "border-[var(--color-gold-200)] bg-[var(--color-gold-100)] text-[var(--color-gold-800)]"
            }`}
          >
            {topicsPanelOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            )}
            <span>{te.topicsTab}</span>
          </button>

          <button
            type="button"
            data-testid="toggle-topic-map"
            onClick={() => setMapOpen((prev) => !prev)}
            title={mapOpen ? tmap.openList : tmap.title}
            className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
              mapOpen
                ? "border-[var(--color-gold-700)] bg-[var(--color-gold-100)] text-[var(--color-ink-900)]"
                : "border-[var(--color-line)] bg-[var(--color-paper)] text-ink-700 hover:bg-[var(--color-sunken)]"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{mapOpen ? tmap.openList : tmap.openMap}</span>
          </button>

          <button
            type="button"
            onClick={() => setFocusMode((prev) => !prev)}
            title={te.focusTooltip}
            className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
              focusMode
                ? "border-[var(--color-gold-200)] bg-[var(--color-gold-100)] text-[var(--color-gold-800)]"
                : "border-[var(--color-line)] bg-[var(--color-paper)] text-ink-700 hover:bg-[var(--color-sunken)]"
            }`}
          >
            {focusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{te.focusEnter}</span>
          </button>

          <button
            type="button"
            onClick={() => setRightPane((prev) => (prev === "pdf" ? "assist" : "pdf"))}
            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-[var(--color-sunken)]"
          >
            {rightPane === "pdf" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{rightPane === "pdf" ? te.hidePdf : te.showPdf}</span>
          </button>
        </>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setActionsMenuOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1.5 text-xs font-semibold text-ink-700 transition hover:bg-[var(--color-sunken)]"
        >
          {uploadingDocs ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-gold-800)]" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{te.actions}</span>
        </button>

        {actionsMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setActionsMenuOpen(false)} />
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-1.5 shadow-xl">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--color-gold-800)] transition hover:bg-[var(--color-gold-100)]/50">
                <Plus className="h-3.5 w-3.5" />
                <span>{te.addFiles}</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  multiple
                  disabled={uploadingDocs}
                  onChange={handleAddPdfs}
                  className="hidden"
                />
              </label>
              <div className="my-1 border-t border-[var(--color-line)]" />
              <a
                href={getExportNotesUrl(examId, lang)}
                download
                onClick={() => setActionsMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-[var(--color-sunken)]"
              >
                <Download className="h-3.5 w-3.5 text-[var(--color-gold-800)]" />
                {te.exportNotes}
              </a>
              <a
                href={getExportAnkiUrl(examId)}
                download
                onClick={() => setActionsMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-[var(--color-sunken)]"
              >
                <Download className="h-3.5 w-3.5 text-[var(--color-ok)]" />
                {te.exportAnki}
              </a>
              <a
                href={getCalendarIcsUrl(examId, 9, lang)}
                download
                onClick={() => setActionsMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-[var(--color-sunken)]"
              >
                <Calendar className="h-3.5 w-3.5 text-ink-500" />
                {te.exportCalendar}
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );


  // Dato riassuntivo mostrato sotto il titolo: riguarda la sezione aperta.
  const sectionSummary = examSectionSummary(
    mainTab,
    {
      topicsTotal: activeTopics.length,
      topicsWithNotes: activeTopics.filter((tp) => Boolean(tp.notes_markdown?.trim())).length,
      topicsMastered: masteredCount,
      cardsInQueue: flashcards.cards.length,
      cardsInDeck: flashcards.deck.length,
      queueIncludesUpcoming: flashcards.includeUpcoming,
      mocksTaken: mock.history.length,
      mocksPassed: mock.history.filter((item) => item.passed).length,
      estimatedGrade30: analytics?.estimated_grade_30 ?? null,
      retentionPct: analytics?.fsrs_retention ?? null,
    },
    te.summaries
  );

  return (
    <AppShell
      activeSection={mainTab}
      activeExamId={examId}
      pageTitle={`${data.exam.title} — ${sectionLabel}`}
      pageSubtitle={[
        data.exam.university,
        data.exam.exam_date && `${te.examDatePrefix} ${data.exam.exam_date}`,
        sectionSummary,
      ]
        .filter(Boolean)
        .join(" • ")}
      hideShell={focusMode}
      headerExtra={headerActions}
      onSelectSection={handleSwitchSection}
      onActiveExamChange={(nextId) => router.push(`/exam/?id=${nextId}&tab=${mainTab}`)}
      onDataChanged={() => void loadAll(selectedTopic?.id)}
    >
      {selectionPopup && !notes.editing && !notes.synthesizing && (
        <div
          data-selection-toolbar="true"
          style={{ top: selectionPopup.top, left: selectionPopup.left }}
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-ink-700 bg-[var(--color-ink-900)] p-1 text-[var(--color-canvas)] shadow-xl"
        >
          <button
            type="button"
            onClick={() => runTutorQuery(te.explainPrompt, selectionPopup.text)}
            disabled={askingTutor || flashcards.creatingFromSelection}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:bg-[var(--color-paper)]/10"
          >
            <Sparkles className="h-3 w-3 text-[var(--color-gold-800)]" />
            {te.explainSimply}
          </button>
          <div className="h-4 w-px bg-[var(--color-paper)]/20" />
          <button
            type="button"
            onClick={handleCreateCardFromSelection}
            disabled={askingTutor || flashcards.creatingFromSelection}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition hover:bg-[var(--color-paper)]/10"
          >
            <Plus className="h-3 w-3 text-[var(--color-ok)]" />
            {te.flashcardBtn}
          </button>
          <div className="h-4 w-px bg-[var(--color-paper)]/20" />
          <div className="flex items-center gap-1 px-1.5">
            {(
              [
                ["yellow", "bg-[var(--color-mark-yellow)]"],
                ["green", "bg-[var(--color-mark-green)]"],
                ["pink", "bg-[var(--color-mark-pink)]"],
                ["blue", "bg-[var(--color-mark-blue)]"],
              ] as const
            ).map(([col, dotCls]) => (
              <button
                key={col}
                type="button"
                onClick={() => handleAddUserHighlight(col)}
                data-testid={`highlight-${col}`}
                title={col}
                className={`h-4 w-4 rounded-full border border-white/40 transition hover:scale-110 ${dotCls}`}
              />
            ))}
          </div>
        </div>
      )}

      {removeHlPopup && !notes.editing && !notes.synthesizing && (
        <div
          data-selection-toolbar="true"
          style={{ top: removeHlPopup.top, left: removeHlPopup.left }}
          className="fixed z-50 -translate-x-1/2 rounded-xl border border-ink-700 bg-[var(--color-ink-900)] p-1 text-[var(--color-canvas)] shadow-xl"
        >
          <button
            type="button"
            onClick={() => handleRemoveUserHighlight(removeHlPopup.id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--color-paper)]/10"
          >
            <X className="h-3 w-3 text-[var(--color-danger)]" />
            {te.removeHighlight}
          </button>
        </div>
      )}

      {focusMode && (
        <div className="fixed right-5 top-4 z-40">
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-semibold text-[var(--color-gold-800)] shadow-md hover:bg-[var(--color-gold-100)]/50"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            {te.focusExit}
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-2.5 text-xs text-[var(--color-danger)]">
          <span className="inline-flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 text-[var(--color-danger)]" />
            {actionError}
          </span>
          <button onClick={() => setActionError(null)} className="rounded p-1 hover:bg-[var(--color-danger-soft)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {mainTab === "STUDY" && mapOpen ? (
        /* ==================== 3a. MAPPA DEI PREREQUISITI ==================== */
        <TopicMap
          topics={activeTopics}
          selectedTopicId={selectedTopic?.id ?? null}
          onSelectTopic={(topic) => {
            setMapOpen(false);
            selectTopic(topic);
          }}
        />
      ) : mainTab === "STUDY" ? (
        /* ==================== 3. STUDIO & APPUNTI ==================== */
        <div className={focusMode ? "mx-auto max-w-3xl" : "grid gap-4 lg:grid-cols-12"}>
          {!focusMode && topicsPanelOpen && (
            <aside className="space-y-3 lg:col-span-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:pr-1">
              <CourseContextCard summary={data.exam.web_context_summary} />

              <div className="card-surface p-3.5">
                <div className="mb-3 grid grid-cols-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setSidebarTab("TOPICS")}
                    className={`rounded-lg py-1.5 transition ${
                      sidebarTab === "TOPICS"
                        ? "bg-[var(--color-paper)] text-[var(--color-ink-900)] shadow-2xs"
                        : "text-ink-500 hover:text-[var(--color-ink-900)]"
                    }`}
                  >
                    {te.topicsTab} ({activeTopics.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab("PLAN")}
                    className={`rounded-lg py-1.5 transition ${
                      sidebarTab === "PLAN"
                        ? "bg-[var(--color-paper)] text-[var(--color-ink-900)] shadow-2xs"
                        : "text-ink-500 hover:text-[var(--color-ink-900)]"
                    }`}
                  >
                    {te.planTab} ({progressPct}%)
                  </button>
                </div>

                {sidebarTab === "TOPICS" ? (
                  <TopicsTab
                    activeTopics={activeTopics}
                    excludedTopics={excludedTopics}
                    selectedTopic={selectedTopic}
                    onSelectTopic={selectTopic}
                    onCreateTopic={createCustomTopicFromSidebar}
                    creating={savingNewTopic}
                    onRestoreTopic={(topic) => handleToggleExcludeTopic(topic, false)}
                    updatingTopicId={updatingTopicId}
                  />
                ) : (
                  <PlanTab
                    plan={data.plan}
                    topics={activeTopics}
                    completedCount={completedCount}
                    progressPct={progressPct}
                    onToggleItem={handleTogglePlan}
                    onSelectTopic={selectTopic}
                    onGoToMock={() => handleSwitchSection("MOCK")}
                    onReplan={replanWithHours}
                    replanning={replanning}
                    defaultHours={String(data.exam.daily_hours || 2)}
                  />
                )}
              </div>
            </aside>
          )}

          {/* CENTER: NOTES */}
          <section
            onScroll={() => selectionPopup && setSelectionPopup(null)}
            className={`card-surface flex flex-col p-6 ${
              focusMode
                ? "min-h-[calc(100vh-4rem)]"
                : `lg:h-[calc(100vh-8.5rem)] lg:overflow-y-auto ${
                    widePdf && rightPane === "pdf"
                    ? topicsPanelOpen
                      ? "lg:col-span-3"
                      : "lg:col-span-6"
                    : topicsPanelOpen
                    ? "lg:col-span-5"
                    : "lg:col-span-7"
                  }`
            }`}
          >
            {selectedTopic ? (
              <>
                <TopicHeader
                  topic={selectedTopic}
                  topics={activeTopics}
                  showTopicPicker={!topicsPanelOpen && !focusMode && activeTopics.length > 0}
                  onSelectTopic={selectTopic}
                  onChangePriority={handleChangeTopicPriority}
                  onToggleExclude={handleToggleExcludeTopic}
                  updating={updatingTopicId === selectedTopic.id}
                  onGoToFeynman={() => handleSwitchSection("FEYNMAN")}
                />

                <TopicNotesPanel
                  topic={selectedTopic}
                  notes={notes}
                  flashcards={flashcards}
                  highlights={highlights}
                  displayedNotes={displayedNotes}
                  renderedNotesNode={renderedNotesNode}
                  notesContainerRef={notesContainerRef}
                  onNotesClick={handleNotesClick}
                  onNotesMouseUp={handleNotesMouseUp}
                  onSynthesize={handleSynthesize}
                  onOpenPdfAt={openPdfAt}
                  onCloseSelectionPopup={() => setSelectionPopup(null)}
                />
              </>
            ) : (
              <p className="text-sm text-ink-500">{te.selectTopicHint}</p>
            )}
          </section>

          {/* RIGHT PANE: CONCETTI & TUTOR | PDF VIEWER */}
          {!focusMode && (
            <aside
              className={`card-surface flex flex-col overflow-hidden p-4 lg:h-[calc(100vh-8.5rem)] ${
                widePdf && rightPane === "pdf"
                  ? "lg:col-span-6"
                  : topicsPanelOpen
                  ? "lg:col-span-4"
                  : "lg:col-span-5"
              }`}
            >
              <div className="mb-3 grid grid-cols-2 rounded-xl bg-[var(--color-sunken)] p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setRightPane("assist")}
                  className={`rounded-lg py-1.5 transition ${
                    rightPane === "assist"
                      ? "bg-[var(--color-paper)] text-[var(--color-ink-900)] shadow-2xs"
                      : "text-ink-500 hover:text-ink-800"
                  }`}
                >
                  {isEn ? "Concepts & Tutor" : "Concetti & Tutor"}
                </button>
                <button
                  type="button"
                  onClick={() => setRightPane("pdf")}
                  className={`rounded-lg py-1.5 transition ${
                    rightPane === "pdf"
                      ? "bg-[var(--color-paper)] text-[var(--color-ink-900)] shadow-2xs"
                      : "text-ink-500 hover:text-ink-800"
                  }`}
                >
                  📄 PDF Viewer
                </button>
              </div>

              {rightPane === "assist" ? (
                <TutorPane
                  prerequisiteTopics={prerequisiteTopics}
                  onSelectTopic={selectTopic}
                  messages={activeTutorMessages}
                  onOpenCitation={openPdfAt}
                  hasTopic={Boolean(selectedTopic)}
                  onClearThread={() => {
                    if (selectedTopic) void clearTutorThread(selectedTopic.id);
                  }}
                  input={tutorInput}
                  onInputChange={setTutorInput}
                  onAsk={() => void runTutorQuery(tutorInput)}
                  asking={askingTutor}
                />
              ) : (
                <PdfPane
                  documents={data.documents}
                  selectedDocId={selectedDocId}
                  onSelectDoc={(docId) => {
                    setSelectedDocId(docId);
                    setPdfPage(1);
                  }}
                  page={pdfPage}
                  jumpKey={pdfJumpKey}
                  wide={widePdf}
                  onToggleWide={() => setWidePdf(!widePdf)}
                />
              )}
            </aside>
          )}
        </div>
      ) : mainTab === "FEYNMAN" ? (
        <FeynmanView
          activeTopics={activeTopics}
          selectedTopic={selectedTopic}
          onSelectTopic={selectTopic}
          explanation={feynman.explanation}
          onExplanationChange={feynman.setExplanation}
          evaluating={feynman.evaluating}
          feynmanResult={feynman.result}
          activeSessionId={feynman.activeSessionId}
          onResetSession={feynman.resetSession}
          onSubmit={handleFeynman}
          onSaveDraft={() => selectedTopic && void feynman.saveDraft(selectedTopic.id)}
          draftSavedNotice={feynman.draftSavedNotice}
          recordingTarget={recordingTarget}
          recordingSeconds={recordingSeconds}
          transcribingTarget={transcribingTarget}
          onToggleVoice={toggleVoiceRecording}
          onOpenPdfAt={openPdfAt}
          onGoToNotes={() => handleSwitchSection("STUDY")}
        />
      ) : mainTab === "FLASHCARDS" ? (
        <FlashcardsView
          cards={flashcards.cards}
          allUpcomingCards={flashcards.deck}
          activeTopics={activeTopics}
          originFilter={flashcards.originFilter}
          onOriginFilterChange={flashcards.setOriginFilter}
          topicFilter={flashcards.topicFilter}
          onTopicFilterChange={flashcards.setTopicFilter}
          includeUpcoming={flashcards.includeUpcoming}
          onIncludeUpcomingChange={flashcards.setIncludeUpcoming}
          cardIdx={flashcards.cardIdx}
          onCardIdxChange={flashcards.setCardIdx}
          revealed={flashcards.revealed}
          onRevealedChange={flashcards.setRevealed}
          examAnswerDraft={flashcards.examAnswerDraft}
          onExamAnswerDraftChange={flashcards.setExamAnswerDraft}
          onRateCard={flashcards.rate}
        />
      ) : mainTab === "MOCK" ? (
        <MockExamView
          mockQuestions={mock.questions}
          mockAnswers={mock.answers}
          onMockAnswerChange={mock.setAnswer}
          mockResult={mock.result}
          mockHistory={mock.history}
          generatingMock={mock.generating}
          gradingMock={mock.grading}
          mockElapsedSec={mock.elapsedSec}
          mockCountConfig={mock.countConfig}
          onMockCountChange={mock.setCountConfig}
          mockFocusConfig={mock.focusConfig}
          onMockFocusChange={mock.setFocusConfig}
          showMockTimer={mock.showTimer}
          onShowMockTimerChange={mock.setShowTimer}
          onStartMock={() => void mock.start()}
          onSubmitMock={(e) => {
            e.preventDefault();
            void mock.submit();
          }}
          onCancelMock={mock.cancel}
          onResetToHistory={mock.resetSession}
          onOpenHistoryItem={mock.openHistoryItem}
          recordingTarget={recordingTarget}
          recordingSeconds={recordingSeconds}
          transcribingTarget={transcribingTarget}
          onToggleVoice={toggleVoiceRecording}
        />
      ) : (
        <AnalyticsView
          analytics={analytics}
          activeTopics={activeTopics}
          masteredCount={masteredCount}
          onOpenTopicStudy={(tp) => {
            selectTopic(tp);
            handleSwitchSection("STUDY");
          }}
        />
      )}
    </AppShell>
  );
}

export default function ExamWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-sunken)] text-sm text-ink-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--color-gold-800)]" /> Loading workspace...
        </div>
      }
    >
      <ExamWorkspaceInner />
    </Suspense>
  );
}