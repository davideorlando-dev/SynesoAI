"use client";

import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { useImports } from "@/components/ImportsProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { ApiError, ImportJob } from "@/lib/api";
import {
  importProgressPercent,
  isImportActive,
  isImportProgressIndeterminate,
} from "@/lib/importProgress";

interface ImportProgressPanelProps {
  onOpenExam: (examId: string) => void;
}

/** Floating list of background imports: progress, outcome, cancel and dismiss. */
export function ImportProgressPanel({ onOpenExam }: ImportProgressPanelProps) {
  const { jobs, cancel, dismiss } = useImports();
  const { t } = useLanguage();
  const errorMessage = useErrorMessage();
  const ti = t.imports;

  if (jobs.length === 0) return null;

  function parsingDetail(job: ImportJob): string {
    if (job.pages_done > 0) return ti.pages(job.pages_done, job.pages_total);
    const pages = ti.pagesTotal(job.pages_total);
    if (job.files_total <= 1) return pages;
    const fileIndex = Math.min(job.files_done + 1, job.files_total);
    return `${ti.fileOf(fileIndex, job.files_total)} · ${pages}`;
  }

  function statusLine(job: ImportJob): string {
    if (job.status === "queued") return ti.queued;
    if (job.status === "completed") return ti.completed;
    if (job.status === "cancelled") return ti.cancelled;
    if (job.status === "failed") {
      return errorMessage(
        new ApiError(job.error_message || ti.failed, 0, job.error_code),
        ti.failed
      );
    }
    if (job.stage === "parsing" && job.pages_total > 0) {
      return `${ti.stages.parsing} ${parsingDetail(job)}`;
    }
    return job.stage ? ti.stages[job.stage] : ti.queued;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {jobs.map((job) => {
        const active = isImportActive(job);
        const failed = job.status === "failed";
        return (
          <div
            key={job.id}
            data-testid="import-job"
            data-status={job.status}
            className={`rounded-xl border bg-[var(--color-paper)] px-4 py-3 shadow-lg ${
              failed ? "border-[var(--color-danger)]" : "border-[var(--color-gold-200)]"
            }`}
          >
            <div className="flex items-start gap-2">
              {active && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--color-gold-800)]" />}
              {job.status === "completed" && (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ok)]" />
              )}
              {failed && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">{job.title}</p>
                <p className={`mt-0.5 text-xs ${failed ? "text-[var(--color-danger)]" : "text-ink-500"}`}>
                  {statusLine(job)}
                </p>
              </div>
              {!active && (
                <button
                  type="button"
                  onClick={() => dismiss(job.id)}
                  aria-label={ti.dismiss}
                  className="rounded p-1 text-ink-500 hover:bg-[var(--color-sunken)] hover:text-ink-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {active && (
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-gold-100)]">
                  {isImportProgressIndeterminate(job) ? (
                    <div className="h-full w-full animate-pulse rounded-full bg-[var(--color-gold-200)]" />
                  ) : (
                    <div
                      className="h-full rounded-full bg-[var(--color-ink-900)] transition-all duration-500"
                      style={{ width: `${importProgressPercent(job)}%` }}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void cancel(job.id)}
                  className="text-xs font-medium text-ink-500 hover:text-[var(--color-danger)]"
                >
                  {ti.cancel}
                </button>
              </div>
            )}

            {job.status === "completed" && (
              <button
                type="button"
                data-testid="import-open-exam"
                onClick={() => {
                  onOpenExam(job.exam_id);
                  dismiss(job.id);
                }}
                className="mt-2 text-xs font-semibold text-[var(--color-gold-800)] hover:text-[var(--color-gold-800)]"
              >
                {ti.open}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
