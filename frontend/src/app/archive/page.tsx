"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getSavedActiveExamId } from "@/lib/shellStorage";
import { useImports, useOnImportFinished } from "@/components/ImportsProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import {
  ArchiveItem,
  checkHealth,
  getExamsOverview,
  getGlobalArchive,
} from "@/lib/api";

function formatArchDate(iso: string | null, lang: "it" | "en"): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(lang === "en" ? "en-US" : "it-IT", {
    day: "numeric",
    month: "short",
  });
}

function ArchivePageInner() {
  const { lang, t } = useLanguage();
  const errorMessage = useErrorMessage();
  const { startDocumentsImport } = useImports();
  const isEn = lang === "en";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [kindFilter, setKindFilter] = useState<"all" | "pdf" | "note" | "mock">("all");
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    try {
      const online = await checkHealth();
      if (!online) {
        setItems([]);
        return;
      }
      const [arch, overview] = await Promise.all([
        getGlobalArchive(),
        getExamsOverview(),
      ]);
      setItems(arch);
      const saved = getSavedActiveExamId();
      const chosen =
        (saved && overview.find((o) => o.exam.id === saved)?.exam.id) ||
        overview[0]?.exam.id ||
        null;
      setActiveExamId(chosen);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadArchive();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadArchive]);

  useOnImportFinished((job) => {
    if (job.status === "completed") void loadArchive();
  });

  async function handleQuickUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeExamId) return;
    setUploading(true);
    setError(null);
    try {
      // L'import prosegue in background; l'archivio si aggiorna quando termina.
      await startDocumentsImport(activeExamId, files, lang);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const filtered = items.filter((r) => kindFilter === "all" || r.kind === kindFilter);

  const uploadAction = activeExamId ? (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3.5 py-2 text-xs font-semibold text-[var(--color-gold-800)] transition hover:bg-[var(--color-gold-100)]/50">
      {uploading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Upload className="h-3.5 w-3.5" />
      )}
      <span>{isEn ? "Upload file" : "Carica file"}</span>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        multiple
        disabled={uploading}
        onChange={handleQuickUpload}
        className="hidden"
      />
    </label>
  ) : null;

  return (
    <AppShell
      activeSection="ARCHIVE"
      activeExamId={activeExamId}
      pageTitle={t.shell.navArchive}
      pageSubtitle={
        isEn
          ? "Notes, PDF slides and mock results across all exams."
          : "Appunti, dispense e simulazioni di tutti gli esami."
      }
      headerExtra={uploadAction}
      onActiveExamChange={(id) => setActiveExamId(id)}
      onDataChanged={() => void loadArchive()}
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-2.5 text-xs font-medium text-[var(--color-danger)]">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          {(
            [
              ["all", isEn ? "All" : "Tutti"],
              ["pdf", isEn ? "PDF Slides" : "Dispense PDF"],
              ["note", isEn ? "Notes" : "Appunti"],
              ["mock", isEn ? "Mock Exams" : "Simulazioni"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setKindFilter(val)}
              className={`rounded-xl px-3.5 py-1.5 font-semibold transition ${
                kindFilter === val
                  ? "bg-[var(--color-gold-100)] text-[var(--color-gold-800)]"
                  : "border border-[var(--color-line)] bg-[var(--color-paper)] text-ink-600 hover:bg-[var(--color-sunken)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="card-surface overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-xs text-ink-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--color-gold-800)]" />
              {isEn ? "Loading archive..." : "Caricamento archivio..."}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-ink-500">
              {isEn ? "No items in this view yet." : "Nessun materiale in questa sezione."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--color-line)] bg-[var(--color-sunken)] text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="p-4">{isEn ? "Name" : "Nome"}</th>
                    <th className="p-4">{isEn ? "Exam" : "Esame"}</th>
                    <th className="p-4">{isEn ? "Type" : "Dettaglio"}</th>
                    <th className="p-4 text-right">{isEn ? "Updated" : "Aggiornato"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]">
                  {filtered.map((row) => {
                    const href =
                      row.kind === "pdf"
                        ? `/exam/?id=${row.exam_id}&tab=STUDY&docId=${row.doc_id}&page=1`
                        : row.kind === "note"
                        ? `/exam/?id=${row.exam_id}&tab=STUDY&topic=${row.topic_id}`
                        : `/exam/?id=${row.exam_id}&tab=MOCK`;
                    const icon =
                      row.kind === "pdf" ? "📄" : row.kind === "note" ? "📖" : "▶️";

                    return (
                      <tr key={row.id} className="transition hover:bg-[var(--color-sunken)]">
                        <td className="p-4 font-semibold text-[var(--color-ink-900)]">
                          <Link href={href} className="flex items-center gap-2 hover:text-[var(--color-gold-800)]">
                            <span>{icon}</span>
                            <span>{row.title}</span>
                          </Link>
                        </td>
                        <td className="p-4 text-ink-500">{row.exam_title}</td>
                        <td className="p-4">
                          <span className="rounded-md bg-[var(--color-sunken)] px-2 py-0.5 text-[10px] font-semibold text-ink-600">
                            {row.meta}
                          </span>
                        </td>
                        <td className="p-4 text-right font-mono text-ink-400">
                          {formatArchDate(row.updated_at, lang)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function ArchivePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-sunken)] text-sm text-ink-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--color-gold-800)]" /> Loading...
        </div>
      }
    >
      <ArchivePageInner />
    </Suspense>
  );
}