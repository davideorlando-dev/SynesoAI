import { ApiError } from "@/lib/api";
import { Locale, translations } from "@/lib/i18n";

export type Translations = (typeof translations)[Locale];

/**
 * Codes whose translated text is generic on purpose: the server detail is the
 * only place that says what actually went wrong upstream, so it is kept.
 */
const CODES_WITH_SERVER_DETAIL: ReadonlySet<string> = new Set(["llm_unavailable"]);

/**
 * Message to show for a failed action, in the current language.
 *
 * Errors the backend reports with a known `code` are translated; anything
 * else falls back to the error's own message, then to `fallback`.
 */
export function describeError(err: unknown, t: Translations, fallback?: string): string {
  if (err instanceof ApiError && err.code) {
    const byCode: Readonly<Record<string, string | undefined>> = t.errors;
    const translated = byCode[err.code];
    if (translated) {
      return CODES_WITH_SERVER_DETAIL.has(err.code) && err.message
        ? `${translated} (${err.message})`
        : translated;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback ?? t.errors.generic;
}
