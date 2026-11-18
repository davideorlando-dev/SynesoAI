/**
 * One-off migration of the annotations that earlier versions kept in the
 * browser's localStorage (highlights, tutor chats, Feynman drafts) into the
 * database. Browser storage is bound to the http://host:port origin, so that
 * data disappeared whenever the local server had to pick another port.
 *
 * The local copy is removed only after the server has accepted it, and the
 * import is idempotent, so a failed attempt is simply retried on next load.
 */
import {
  HighlightColor,
  importLegacyAnnotations,
  LegacyAnnotationsPayload,
  TutorCitation,
} from "@/lib/api";

const MAX_HIGHLIGHT_CHARS = 1200;
const HIGHLIGHT_COLORS: readonly HighlightColor[] = ["yellow", "green", "pink", "blue"];

const highlightsKey = (examId: string) => `syneso_user_hl_${examId}`;
const tutorThreadsKey = (examId: string) => `syneso_tutor_threads_${examId}`;
const feynmanDraftKey = (topicId: string) => `syneso_feynman_draft_${topicId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord(key: string): Record<string, unknown> {
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toHighlightColor(value: unknown): HighlightColor {
  return HIGHLIGHT_COLORS.find((color) => color === value) ?? "yellow";
}

function readHighlights(examId: string): LegacyAnnotationsPayload["highlights"] {
  const out: LegacyAnnotationsPayload["highlights"] = {};
  for (const [topicId, items] of Object.entries(readJsonRecord(highlightsKey(examId)))) {
    if (!Array.isArray(items)) continue;
    const valid = items
      .filter(isRecord)
      .map((item) => ({
        text: typeof item.text === "string" ? item.text.trim().slice(0, MAX_HIGHLIGHT_CHARS) : "",
        color: toHighlightColor(item.color),
      }))
      .filter((item) => item.text.length > 0);
    if (valid.length > 0) out[topicId] = valid;
  }
  return out;
}

function readTutorThreads(examId: string): LegacyAnnotationsPayload["tutor_threads"] {
  const out: LegacyAnnotationsPayload["tutor_threads"] = {};
  for (const [topicId, items] of Object.entries(readJsonRecord(tutorThreadsKey(examId)))) {
    if (!Array.isArray(items)) continue;
    const valid = items
      .filter(isRecord)
      .filter((item) => typeof item.question === "string" && item.question.trim().length > 0)
      .map((item) => ({
        question: item.question as string,
        selected_text: typeof item.selectedText === "string" ? item.selectedText : null,
        answer_markdown: typeof item.answerMarkdown === "string" ? item.answerMarkdown : "",
        citations: (Array.isArray(item.citations) ? item.citations : []).filter(
          (c): c is TutorCitation => isRecord(c) && typeof c.page_number === "number"
        ),
      }));
    if (valid.length > 0) out[topicId] = valid;
  }
  return out;
}

function readFeynmanDrafts(topicIds: string[]): LegacyAnnotationsPayload["feynman_drafts"] {
  const out: LegacyAnnotationsPayload["feynman_drafts"] = {};
  for (const topicId of topicIds) {
    const draft = localStorage.getItem(feynmanDraftKey(topicId));
    if (draft && draft.trim()) out[topicId] = draft;
  }
  return out;
}

export async function migrateLegacyAnnotations(
  examId: string,
  topicIds: string[]
): Promise<void> {
  if (typeof window === "undefined" || !examId) return;

  let payload: LegacyAnnotationsPayload;
  try {
    payload = {
      highlights: readHighlights(examId),
      tutor_threads: readTutorThreads(examId),
      feynman_drafts: readFeynmanDrafts(topicIds),
    };
  } catch {
    return; // localStorage non disponibile: niente da migrare
  }

  const hasLegacyData =
    Object.keys(payload.highlights).length > 0 ||
    Object.keys(payload.tutor_threads).length > 0 ||
    Object.keys(payload.feynman_drafts).length > 0;
  if (hasLegacyData) await importLegacyAnnotations(examId, payload);

  try {
    localStorage.removeItem(highlightsKey(examId));
    localStorage.removeItem(tutorThreadsKey(examId));
    for (const topicId of topicIds) localStorage.removeItem(feynmanDraftKey(topicId));
  } catch {
    // la pulizia verrà ritentata al prossimo caricamento
  }
}
