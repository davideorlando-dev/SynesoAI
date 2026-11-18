function getBackendOrigin(): string {
  // Impostata dai test end-to-end, che usano porte proprie per non toccare
  // il backend di sviluppo e i suoi dati.
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    if (port === "3000") return `${protocol}//${hostname}:8000`;
    return window.location.origin;
  }
  return "http://127.0.0.1:8000";
}
const API_BASE = `${getBackendOrigin()}/api`;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Builds the error for a failed response. The backend reports failures as
 * `{ detail, code }`; anything else (validation arrays, plain-text 500s)
 * falls back to the caller's message so raw server text never reaches the UI.
 */
async function apiError(res: Response, fallback: string): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const { detail, code } = parsed as { detail?: unknown; code?: unknown };
      if (typeof detail === "string" && detail) {
        return new ApiError(detail, res.status, typeof code === "string" ? code : null);
      }
    }
  } catch {
    // corpo non JSON: si usa il messaggio di fallback
  }
  return new ApiError(fallback, res.status);
}

export interface Exam {
  id: string;
  title: string;
  university: string | null;
  degree_course: string | null;
  professor: string | null;
  exam_date: string | null;
  daily_hours: number;
  web_context_summary: string | null;
  syllabus_guidance: string | null;
  created_at: string;
}

export interface ExamOverviewItem {
  exam: Exam;
  stats: {
    topicsTotal: number;
    topicsMastered: number;
    planTotal: number;
    planDone: number;
    dueCards: number;
    totalCards?: number;
    estimatedMinutesLeft?: number;
    mockCount?: number;
    latestMockScore?: number | null;
    estimatedGrade30?: number | null;
    fsrsRetention?: number | null;
  };
}

export interface SearchResultItem {
  type: "topic" | "note" | "flashcard" | "pdf";
  title: string;
  snippet: string;
  topic_id?: string;
  doc_id?: string;
  page_number?: number;
  tab: "STUDY" | "FLASHCARDS";
}
export interface UpcomingDeadlineItem {
  id: string;
  kind: "plan" | "exam_date";
  exam_id: string;
  exam_title: string;
  topic_id: string | null;
  task_type: string;
  title: string;
  date: string;
  completed: boolean;
}

export interface ArchiveItem {
  id: string;
  kind: "pdf" | "note" | "mock";
  title: string;
  exam_id: string;
  exam_title: string;
  doc_id: string | null;
  topic_id: string | null;
  updated_at: string | null;
  meta: string;
}

export interface ExamAnalyticsResponse {
  fsrs_retention: number | null;
  estimated_minutes_left: number;
  estimated_grade_30: number | null;
  topics_total: number;
  topics_mastered: number;
  weekly_activity: {
    date: string;
    weekday_idx: number;
    label: string;
    count: number;
  }[];
  topic_mastery: {
    id: string;
    title: string;
    priority: "CORE" | "IMPORTANT" | "DETAIL";
    status: string;
    mastery_score: number;
  }[];
}
export interface DocumentInfo {
  id: string;
  filename: string;
  page_count: number;
}

export interface Highlight {
  doc_id?: string | null;
  filename?: string | null;
  page_number: number;
  quote: string;
  why_it_matters: string;
  verified?: boolean;
}

export interface Topic {
  id: string;
  exam_id: string;
  title: string;
  description: string;
  priority: "CORE" | "IMPORTANT" | "DETAIL";
  estimated_minutes: number;
  prerequisites_json: string;
  source_pages_json: string;
  notes_markdown: string | null;
  highlights_json: string;
  web_sources_json: string;
  status: "LOCKED" | "READY" | "FEYNMAN_PENDING" | "MASTERED";
  excluded?: boolean;
  mastery_score: number;
}

export interface StudyPlanItem {
  id: string;
  exam_id: string;
  topic_id: string | null;
  scheduled_date: string;
  task_type: string;
  title: string;
  completed: boolean;
}

export interface RoadmapResponse {
  exam: Exam;
  documents: DocumentInfo[];
  topics: Topic[];
  plan: StudyPlanItem[];
}

export interface FeynmanTurn {
  role: "student" | "examiner";
  text: string;
  score?: number;
  understood?: string[];
  gaps?: string[];
}

export interface FeynmanRubricItem {
  concept: string;
  weight: number;
  status: "COVERED" | "PARTIAL" | "MISSING";
  evidence: string;
  source_doc_id?: string | null;
  source_page?: number | null;
}

export interface FeynmanResponse {
  session_id: string;
  topic_id: string;
  topic_status: string;
  mastery_score: number;
  passed: boolean;
  rubric?: FeynmanRubricItem[];
  understood_points: string[];
  missing_or_wrong: string[];
  socratic_followup: string;
  transcript: FeynmanTurn[];
  auto_generated_gap_cards?: { id: string; front: string; back: string }[];
}

export interface DueCard {
  id: string;
  topic_id: string;
  type: "BASIC" | "CLOZE" | "EXAM_Q" | string;
  origin: string;
  front: string;
  back: string;
  due_at: string;
  previews?: Record<string, string>;
}

export interface MockQuestion {
  id: string;
  topic_id: string;
  topic_title: string;
  question: string;
  expected_points: string[];
  max_points: number;
}

export interface MockQuestionFeedback {
  question_id: string;
  score: number;
  max_score: number;
  strengths: string[];
  missing: string[];
  model_answer: string;
}

export interface MockExamResult {
  score_30: number;
  passed: boolean;
  overall_feedback: string;
  question_feedback: MockQuestionFeedback[];
  added_cards_count: number;
}

export function getPdfUrl(docId: string, page = 1, jumpKey?: number): string {
  const q = jumpKey ? `?j=${jumpKey}` : "";
  return `${API_BASE}/exams/documents/${docId}/pdf${q}#page=${page}`;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getBackendOrigin()}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listExams(): Promise<Exam[]> {
  const res = await fetch(`${API_BASE}/exams/`);
  if (!res.ok) throw await apiError(res, "Impossibile caricare gli esami.");
  const data = await res.json();
  return data.exams;
}

export async function getExamsOverview(): Promise<ExamOverviewItem[]> {
  const res = await fetch(`${API_BASE}/exams/overview`);
  if (!res.ok) throw await apiError(res, "Impossibile caricare la panoramica esami.");
  const data = await res.json();
  return data.items || [];
}

export async function deleteExam(examId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/exams/${examId}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "Errore nell'eliminazione dell'esame.");
}

export async function getRoadmap(examId: string): Promise<RoadmapResponse> {
  const res = await fetch(`${API_BASE}/exams/${examId}/roadmap`);
  if (!res.ok) throw await apiError(res, "Impossibile caricare il workspace dell'esame.");
  return res.json();
}

export interface FeynmanHistory {
  session: FeynmanResponse | null;
  draft: string;
}

export async function getFeynmanHistory(topicId: string): Promise<FeynmanHistory> {
  const res = await fetch(`${API_BASE}/study/topics/${topicId}/feynman-history`);
  if (!res.ok) return { session: null, draft: "" };
  const data = await res.json();
  return { session: data.session ?? null, draft: data.draft ?? "" };
}

export async function saveFeynmanDraft(topicId: string, text: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/study/topics/${encodeURIComponent(topicId)}/feynman-draft`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }
  );
  if (!res.ok) throw await apiError(res, "Errore nel salvataggio della bozza.");
}

export async function submitFeynman(
  topicId: string,
  explanation: string,
  sessionId?: string | null
): Promise<FeynmanResponse> {
  const res = await fetch(`${API_BASE}/study/topics/${topicId}/feynman`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ explanation, session_id: sessionId ?? null }),
  });
  if (!res.ok) throw await apiError(res, "Errore nella valutazione Feynman.");
  return res.json();
}

export async function transcribeAudio(blob: Blob, filename: string, language = "auto"): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, filename);
  fd.append("language", language);
  const res = await fetch(`${API_BASE}/study/transcribe`, { method: "POST", body: fd });
  if (!res.ok) throw await apiError(res, "Errore nella trascrizione audio.");
  const data = await res.json();
  return data.text || "";
}

export async function getDueCards(examId: string, includeUpcoming = false, lang = "it"): Promise<DueCard[]> {
  const res = await fetch(
    `${API_BASE}/study/exams/${examId}/due-cards?include_upcoming=${includeUpcoming}&lang=${lang}`
  );
  if (!res.ok) throw await apiError(res, "Impossibile caricare le flashcard.");
  const data = await res.json();
  return data.cards;
}

export async function reviewCard(cardId: string, rating: 1 | 2 | 3 | 4) {
  const res = await fetch(`${API_BASE}/study/cards/${cardId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) throw await apiError(res, "Errore durante la registrazione del ripasso.");
  return res.json();
}

export async function togglePlanItem(
  itemId: string
): Promise<{ id: string; completed: boolean }> {
  const res = await fetch(`${API_BASE}/study/plan-items/${itemId}/toggle`, {
    method: "PATCH",
  });
  if (!res.ok) throw await apiError(res, "Errore nell'aggiornamento del piano.");
  return res.json();
}

export async function replanExam(
  examId: string,
  lang = "it",
  dailyHours?: number
): Promise<{ exam_id: string; rescheduled_count: number; daily_hours: number }> {
  const hrsParam = dailyHours !== undefined ? `&daily_hours=${dailyHours}` : "";
  const res = await fetch(`${API_BASE}/exams/${examId}/replan?lang=${lang}${hrsParam}`, { method: "POST" });
  if (!res.ok) throw await apiError(res, "Errore nel ricalcolo del piano.");
  return res.json();
}

export async function generateMoreCards(
  topicId: string,
  count = 5
): Promise<{ topic_id: string; added_count: number }> {
  const res = await fetch(`${API_BASE}/study/topics/${topicId}/more-cards?count=${count}`, {
    method: "POST",
  });
  if (!res.ok) throw await apiError(res, "Errore nella generazione delle flashcard extra.");
  return res.json();
}

export function getExportNotesUrl(examId: string, lang = "it"): string {
  return `${API_BASE}/exams/${examId}/export-notes?lang=${lang}`;
}

export function getExportAnkiUrl(examId: string): string {
  return `${API_BASE}/exams/${examId}/export-anki`;
}

export function getCalendarIcsUrl(examId: string, hour = 9, lang = "it"): string {
  return `${API_BASE}/exams/${examId}/calendar.ics?hour=${hour}&lang=${lang}`;
}

export async function updateTopicNotes(
  topicId: string,
  notesMarkdown: string
): Promise<{ topic_id: string; notes_markdown: string }> {
  const res = await fetch(`${API_BASE}/study/topics/${encodeURIComponent(topicId)}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes_markdown: notesMarkdown }),
  });
  if (!res.ok) throw await apiError(res, "Errore nel salvataggio degli appunti.");
  return res.json();
}

export async function synthesizeTopicStream(
  topicId: string,
  force: boolean,
  handlers: {
    onToken: (text: string) => void;
    onPhase: (message: string) => void;
    onDone: (highlights: Highlight[]) => void;
  },
  signal?: AbortSignal,
  lang = "it"
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/study/topics/${topicId}/synthesize-stream?force=${force}&lang=${lang}`,
    { method: "POST", signal }
  );
  const streamFallback = "Errore nella generazione in streaming degli appunti.";
  if (!res.ok) throw await apiError(res, streamFallback);
  if (!res.body) throw new ApiError(streamFallback, res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const ev of events) {
      const line = ev.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6));
      if (payload.type === "token") {
        handlers.onToken(payload.text);
      } else if (payload.type === "phase") {
        handlers.onPhase(payload.message);
      } else if (payload.type === "done") {
        handlers.onDone(payload.highlights || []);
      } else if (payload.type === "error") {
        throw new ApiError(
          payload.message || streamFallback,
          res.status,
          typeof payload.code === "string" ? payload.code : null
        );
      }
    }
  }
}

export async function generateMockExam(
  examId: string,
  count = 6,
  focus: "ALL" | "CORE" | "WEAK" = "ALL"
): Promise<{ questions: MockQuestion[] }> {
  const res = await fetch(
    `${API_BASE}/study/exams/${examId}/mock-exam/generate?count=${count}&focus=${focus}`,
    { method: "POST" }
  );
  if (!res.ok) throw await apiError(res, "Errore nella generazione della simulazione d'esame.");
  return res.json();
}

export async function gradeMockExam(
  examId: string,
  questions: MockQuestion[],
  answers: Record<string, string>
): Promise<MockExamResult> {
  const res = await fetch(`${API_BASE}/study/exams/${examId}/mock-exam/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions, answers }),
  });
  if (!res.ok) throw await apiError(res, "Errore nella correzione della simulazione d'esame.");
  return res.json();
}

export interface AppSettings {
  app_version: string;
  has_api_key: boolean;
  api_key_masked: string;
  llm_model: string;
  enable_web_search: boolean;
  available_models: { id: string; label: string }[];
}

export interface MockExamHistoryItem {
  id: string;
  score_30: number;
  passed: boolean;
  overall_feedback: string;
  questions: MockQuestion[];
  answers: Record<string, string>;
  feedback: MockQuestionFeedback[];
  created_at: string;
}

export async function getAppSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw await apiError(res, "Impossibile leggere le impostazioni.");
  return res.json();
}

export async function updateAppSettings(payload: {
  groq_api_key?: string;
  llm_model?: string;
  enable_web_search?: boolean;
}): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await apiError(res, "Errore nel salvataggio delle impostazioni.");
  return res.json();
}

export async function testAppSettings(payload: {
  groq_api_key?: string;
  llm_model?: string;
}): Promise<{ ok: boolean; model: string; latency_ms: number }> {
  const res = await fetch(`${API_BASE}/settings/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await apiError(res, "Test connessione fallito.");
  return res.json();
}

export async function getMockHistory(examId: string): Promise<MockExamHistoryItem[]> {
  const res = await fetch(`${API_BASE}/study/exams/${examId}/mock-history`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.sessions || [];
}
export interface TutorCitation {
  doc_id: string | null;
  filename: string | null;
  page_number: number;
}

export interface TutorAnswerResponse {
  id: string;
  answer_markdown: string;
  citations: TutorCitation[];
}

export async function askTopicTutor(
  topicId: string,
  question: string,
  selectedText?: string | null
): Promise<TutorAnswerResponse> {
  const res = await fetch(`${API_BASE}/study/topics/${encodeURIComponent(topicId)}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, selected_text: selectedText ?? null }),
  });
  if (!res.ok) throw await apiError(res, "Errore nella richiesta al Tutor.");
  return res.json();
}

export async function createCardFromText(
  topicId: string,
  selectedText: string
): Promise<{ card: { id: string; type: string; front: string; back: string } }> {
  const res = await fetch(
    `${API_BASE}/study/topics/${encodeURIComponent(topicId)}/card-from-text`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_text: selectedText }),
    }
  );
  if (!res.ok) throw await apiError(res, "Errore nella creazione della flashcard.");
  return res.json();
}
export async function createCustomTopic(
  examId: string,
  payload: {
    title: string;
    description?: string;
    priority: "CORE" | "IMPORTANT" | "DETAIL";
    estimated_minutes?: number;
  }
): Promise<{ topic: Topic; matched_pages: number }> {
  const res = await fetch(`${API_BASE}/exams/${encodeURIComponent(examId)}/topics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await apiError(res, "Errore nella creazione dell'argomento.");
  }
  return res.json();
}

export async function updateTopicSettings(
  topicId: string,
  payload: {
    title?: string;
    description?: string;
    priority?: "CORE" | "IMPORTANT" | "DETAIL";
    excluded?: boolean;
  }
): Promise<{ topic: Topic }> {
  const res = await fetch(`${API_BASE}/study/topics/${encodeURIComponent(topicId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await apiError(res, "Errore nell'aggiornamento dell'argomento.");
  }
  return res.json();
}
export interface ExamInsights {
  exam: Exam;
  preparation_pct: number;
  topics_total: number;
  topics_mastered: number;
  plan_total: number;
  plan_done: number;
  total_cards: number;
  due_cards: number;
  reviewed_cards: number;
  fsrs_retention_pct: number | null;
  estimated_hours_left: number;
  mock_count: number;
  latest_mock_score: number | null;
  estimated_grade_30: number | null;
  feynman_pending_topic: { id: string; title: string } | null;
  next_tasks: {
    id: string;
    kind: "STUDY" | "MOCK";
    topic_id: string | null;
    title: string;
    priority: "CORE" | "IMPORTANT" | "DETAIL" | null;
    estimated_minutes: number;
    scheduled_date: string;
  }[];
  topics_roadmap: {
    id: string;
    title: string;
    priority: "CORE" | "IMPORTANT" | "DETAIL";
    status: "LOCKED" | "READY" | "FEYNMAN_PENDING" | "MASTERED";
    mastery_score: number;
    estimated_minutes: number;
  }[];
}

export interface TimelineTask {
  id: string;
  kind: "STUDY" | "MOCK";
  topic_id: string | null;
  title: string;
  minutes: number;
}

export interface TimelineDay {
  date: string;
  is_today: boolean;
  is_late: boolean;
  minutes: number;
  tasks: TimelineTask[];
}

export interface TimelineProjection {
  days_left: number;
  daily_minutes: number;
  available_minutes: number;
  required_minutes: number;
  topics_total: number;
  topics_mastered: number;
  topics_projected: number;
  next_topic_out_of_reach: string | null;
  extra_minutes_per_day: number;
  covers_everything: boolean;
}

export interface ExamTimeline {
  exam: Exam;
  today_date: string;
  days_left: number | null;
  past: { date: string; activities: number }[];
  past_summary: { days: number; active_days: number; activities: number };
  late_days: TimelineDay[];
  today: TimelineDay | null;
  upcoming: TimelineDay[];
  projection: TimelineProjection | null;
}

export async function getExamTimeline(examId: string): Promise<ExamTimeline | null> {
  const res = await fetch(`${API_BASE}/exams/${encodeURIComponent(examId)}/timeline`);
  if (!res.ok) return null;
  return res.json();
}

export async function getExamInsights(examId: string): Promise<ExamInsights> {
  const res = await fetch(`${API_BASE}/exams/${encodeURIComponent(examId)}/insights`);
  if (!res.ok) throw await apiError(res, "Impossibile caricare le analisi dell'esame.");
  return res.json();
}

export async function searchExam(
  examId: string,
  query: string
): Promise<SearchResultItem[]> {
  if (!examId || query.trim().length < 2) return [];
  const res = await fetch(
    `${API_BASE}/exams/${encodeURIComponent(examId)}/search?q=${encodeURIComponent(query.trim())}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}
export async function getUpcomingDeadlines(limit = 8): Promise<UpcomingDeadlineItem[]> {
  const res = await fetch(`${API_BASE}/exams/upcoming-deadlines?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}
export async function getGlobalArchive(): Promise<ArchiveItem[]> {
  const res = await fetch(`${API_BASE}/exams/archive`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

export async function getExamAnalytics(examId: string): Promise<ExamAnalyticsResponse | null> {
  const res = await fetch(`${API_BASE}/exams/${encodeURIComponent(examId)}/analytics`);
  if (!res.ok) return null;
  return res.json();
}

export type HighlightColor = "yellow" | "green" | "pink" | "blue";

export interface UserHighlight {
  id: string;
  text: string;
  color: HighlightColor;
}

export interface TutorMessage {
  id: string;
  question: string;
  selectedText?: string;
  answerMarkdown: string;
  citations: TutorCitation[];
}

export interface ExamAnnotations {
  highlights: Record<string, UserHighlight[]>;
  tutorThreads: Record<string, TutorMessage[]>;
}

interface TutorMessageDto {
  id: string;
  question: string;
  selected_text: string | null;
  answer_markdown: string;
  citations: TutorCitation[];
}

function toTutorMessage(dto: TutorMessageDto): TutorMessage {
  return {
    id: dto.id,
    question: dto.question,
    selectedText: dto.selected_text ?? undefined,
    answerMarkdown: dto.answer_markdown,
    citations: dto.citations || [],
  };
}

export async function getExamAnnotations(examId: string): Promise<ExamAnnotations> {
  const res = await fetch(
    `${API_BASE}/study/exams/${encodeURIComponent(examId)}/annotations`
  );
  if (!res.ok) throw await apiError(res, "Impossibile caricare evidenziazioni e chat.");
  const data: {
    highlights?: Record<string, UserHighlight[]>;
    tutor_threads?: Record<string, TutorMessageDto[]>;
  } = await res.json();
  const tutorThreads: Record<string, TutorMessage[]> = {};
  for (const [topicId, messages] of Object.entries(data.tutor_threads || {})) {
    tutorThreads[topicId] = messages.map(toTutorMessage);
  }
  return { highlights: data.highlights || {}, tutorThreads };
}

export async function addTopicHighlight(
  topicId: string,
  text: string,
  color: HighlightColor
): Promise<UserHighlight> {
  const res = await fetch(
    `${API_BASE}/study/topics/${encodeURIComponent(topicId)}/highlights`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, color }),
    }
  );
  if (!res.ok) throw await apiError(res, "Errore nel salvataggio dell'evidenziazione.");
  const data: { highlight: UserHighlight } = await res.json();
  return data.highlight;
}

export async function deleteHighlight(highlightId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/study/highlights/${encodeURIComponent(highlightId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw await apiError(res, "Errore nella rimozione dell'evidenziazione.");
}

export async function clearTutorMessages(topicId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/study/topics/${encodeURIComponent(topicId)}/tutor-messages`,
    { method: "DELETE" }
  );
  if (!res.ok) throw await apiError(res, "Errore nella cancellazione della chat.");
}

export interface LegacyAnnotationsPayload {
  highlights: Record<string, { text: string; color: HighlightColor }[]>;
  tutor_threads: Record<
    string,
    {
      question: string;
      selected_text: string | null;
      answer_markdown: string;
      citations: TutorCitation[];
    }[]
  >;
  feynman_drafts: Record<string, string>;
}

export async function importLegacyAnnotations(
  examId: string,
  payload: LegacyAnnotationsPayload
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/study/exams/${encodeURIComponent(examId)}/annotations/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw await apiError(res, "Errore nell'importazione delle annotazioni.");
}

export type ImportStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ImportStage = "parsing" | "mapping" | "planning" | "saving";

export interface ImportJob {
  id: string;
  kind: "create_exam" | "add_documents";
  status: ImportStatus;
  stage: ImportStage | null;
  exam_id: string;
  title: string;
  files_total: number;
  files_done: number;
  pages_total: number;
  pages_done: number;
  current_file: string | null;
  error_code: string | null;
  error_message: string | null;
}

async function readImportJob(res: Response, fallback: string): Promise<ImportJob> {
  if (!res.ok) throw await apiError(res, fallback);
  const data: { job: ImportJob } = await res.json();
  return data.job;
}

export async function startExamImport(formData: FormData): Promise<ImportJob> {
  const res = await fetch(`${API_BASE}/imports/exams`, { method: "POST", body: formData });
  return readImportJob(res, "Errore nella creazione dell'esame.");
}

export async function startDocumentsImport(
  examId: string,
  files: FileList,
  lang = "it"
): Promise<ImportJob> {
  const fd = new FormData();
  fd.append("lang", lang);
  Array.from(files).forEach((f) => fd.append("files", f));
  const res = await fetch(
    `${API_BASE}/imports/exams/${encodeURIComponent(examId)}/documents`,
    { method: "POST", body: fd }
  );
  return readImportJob(res, "Errore nel caricamento dei nuovi file.");
}

export async function getImportJob(jobId: string): Promise<ImportJob> {
  const res = await fetch(`${API_BASE}/imports/${encodeURIComponent(jobId)}`);
  return readImportJob(res, "Impossibile leggere lo stato dell'import.");
}

export async function getActiveImports(): Promise<ImportJob[]> {
  const res = await fetch(`${API_BASE}/imports/active`);
  if (!res.ok) throw await apiError(res, "Impossibile leggere gli import in corso.");
  const data: { jobs?: ImportJob[] } = await res.json();
  return data.jobs || [];
}

export async function cancelImport(jobId: string): Promise<ImportJob> {
  const res = await fetch(`${API_BASE}/imports/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
  return readImportJob(res, "Impossibile annullare l'import.");
}
