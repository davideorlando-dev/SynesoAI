"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  cancelImport,
  getActiveImports,
  getImportJob,
  ImportJob,
  startDocumentsImport as apiStartDocumentsImport,
  startExamImport as apiStartExamImport,
} from "@/lib/api";
import { isImportActive } from "@/lib/importProgress";

const POLL_INTERVAL_MS = 1000;

interface ImportsContextValue {
  /** Imports started in this session or still running, oldest first. */
  jobs: ImportJob[];
  /** The import that most recently reached a final state. */
  lastFinished: ImportJob | null;
  startExamImport: (formData: FormData) => Promise<ImportJob>;
  startDocumentsImport: (examId: string, files: FileList, lang: string) => Promise<ImportJob>;
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => void;
}

const ImportsContext = createContext<ImportsContextValue | null>(null);

/**
 * Tracks background imports for the whole app, so progress survives page
 * navigation. Lives in the root layout.
 */
export function ImportsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [lastFinished, setLastFinished] = useState<ImportJob | null>(null);

  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const upsert = useCallback((job: ImportJob) => {
    setJobs((prev) =>
      prev.some((j) => j.id === job.id)
        ? prev.map((j) => (j.id === job.id ? job : j))
        : [...prev, job]
    );
  }, []);

  // Imports already running when the page loads (e.g. after a reload).
  useEffect(() => {
    let cancelled = false;
    getActiveImports()
      .then((active) => {
        if (!cancelled) active.forEach(upsert);
      })
      .catch(() => {
        // backend non raggiungibile: nessun import da mostrare
      });
    return () => {
      cancelled = true;
    };
  }, [upsert]);

  const hasActive = jobs.some(isImportActive);

  useEffect(() => {
    if (!hasActive) return;
    let stopped = false;
    let inFlight = false;

    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const active = jobsRef.current.filter(isImportActive);
        const results = await Promise.allSettled(active.map((job) => getImportJob(job.id)));
        if (stopped) return;
        for (const result of results) {
          if (result.status !== "fulfilled") continue;
          upsert(result.value);
          if (!isImportActive(result.value)) setLastFinished(result.value);
        }
      } finally {
        inFlight = false;
      }
    }, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [hasActive, upsert]);

  const startExamImport = useCallback(
    async (formData: FormData) => {
      const job = await apiStartExamImport(formData);
      upsert(job);
      return job;
    },
    [upsert]
  );

  const startDocumentsImport = useCallback(
    async (examId: string, files: FileList, lang: string) => {
      const job = await apiStartDocumentsImport(examId, files, lang);
      upsert(job);
      return job;
    },
    [upsert]
  );

  const cancel = useCallback(
    async (jobId: string) => {
      upsert(await cancelImport(jobId));
    },
    [upsert]
  );

  const dismiss = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const value = useMemo(
    () => ({ jobs, lastFinished, startExamImport, startDocumentsImport, cancel, dismiss }),
    [jobs, lastFinished, startExamImport, startDocumentsImport, cancel, dismiss]
  );

  return <ImportsContext.Provider value={value}>{children}</ImportsContext.Provider>;
}

export function useImports(): ImportsContextValue {
  const value = useContext(ImportsContext);
  if (!value) throw new Error("useImports must be used inside ImportsProvider");
  return value;
}

/** Runs `handler` once for each import that reaches a final state. */
export function useOnImportFinished(handler: (job: ImportJob) => void) {
  const { lastFinished } = useImports();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const handledIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lastFinished || handledIdRef.current === lastFinished.id) return;
    handledIdRef.current = lastFinished.id;
    handlerRef.current(lastFinished);
  }, [lastFinished]);
}
