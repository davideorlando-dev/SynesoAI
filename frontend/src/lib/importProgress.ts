import { ImportJob } from "@/lib/api";

/** Share of the bar given to reading the files; the remaining stages are short. */
const PARSING_SHARE = 60;
const STAGE_START: Record<NonNullable<ImportJob["stage"]>, number> = {
  parsing: 0,
  mapping: PARSING_SHARE,
  planning: 85,
  saving: 95,
};

export function isImportActive(job: ImportJob): boolean {
  return job.status === "queued" || job.status === "running";
}

/**
 * While a file's text is being extracted the backend cannot report pages one
 * by one: the count only starts moving once pages are collected or OCR runs.
 * Until then the bar is shown as "working" instead of stuck at zero.
 */
export function isImportProgressIndeterminate(job: ImportJob): boolean {
  return job.status === "running" && job.stage === "parsing" && job.pages_done === 0;
}

/** Overall progress of an import, from 0 to 100. */
export function importProgressPercent(job: ImportJob): number {
  if (job.status === "completed") return 100;
  if (!job.stage) return 0;
  if (job.stage !== "parsing") return STAGE_START[job.stage];

  const ratio =
    job.pages_total > 0
      ? job.pages_done / job.pages_total
      : job.files_total > 0
        ? job.files_done / job.files_total
        : 0;
  return Math.round(PARSING_SHARE * Math.min(1, Math.max(0, ratio)));
}
