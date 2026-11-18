"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useImports } from "@/components/ImportsProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * Il cassetto del nuovo esame.
 *
 * Tutto quello che riguarda il modulo — i sette campi, i file scelti, il
 * trascinamento, l'errore — vive qui e muore con lui: il cassetto viene
 * montato solo quando si apre, quindi non serve svuotare niente a mano dopo
 * un invio riuscito.
 *
 * L'import vero prosegue in background: questo componente lo avvia e si
 * chiude, l'avanzamento è nel pannello degli import.
 */
export function NewExamDrawer({
  backendOnline,
  onClose,
}: {
  /** Senza backend l'invio resta spento: l'import partirebbe e fallirebbe. */
  backendOnline: boolean;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const errorMessage = useErrorMessage();
  // Quella del provider, non quella dell'API: è lei che registra il lavoro
  // nel pannello degli import e ne segue l'avanzamento.
  const { startExamImport } = useImports();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);

  const [title, setTitle] = useState("");
  const [university, setUniversity] = useState("");
  const [degreeCourse, setDegreeCourse] = useState("");
  const [professor, setProfessor] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyHours, setDailyHours] = useState("2");
  const [syllabusGuidance, setSyllabusGuidance] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    setSelectedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => `${f.name}-${f.size}`));
      return [...prev, ...incoming.filter((f) => !existingNames.has(`${f.name}-${f.size}`))];
    });
  }

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setCreateError(t.drawer.errorNoFile);
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      if (university) fd.append("university", university);
      if (degreeCourse) fd.append("degree_course", degreeCourse);
      if (professor) fd.append("professor", professor);
      if (examDate) fd.append("exam_date", examDate);
      fd.append("daily_hours", dailyHours || "2");
      if (syllabusGuidance.trim()) fd.append("syllabus_guidance", syllabusGuidance.trim());
      fd.append("lang", lang);
      selectedFiles.forEach((f) => fd.append("files", f));

      await startExamImport(fd);
      onClose();
    } catch (err) {
      setCreateError(errorMessage(err, t.drawer.errorCreate));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--color-scrim)] backdrop-blur-xs">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.drawer.title}
        className="flex h-full w-full max-w-lg flex-col justify-between overflow-y-auto border-l border-line bg-[var(--color-paper)] p-6 shadow-2xl"
      >
        <div>
          <div className="mb-6 flex items-center justify-between border-b border-line pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-ink-900)] text-[var(--color-canvas)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--color-ink-900)]">{t.drawer.title}</h2>
                <p className="text-xs text-ink-500">{t.drawer.subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={creating}
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-500 hover:bg-line hover:text-ink-700 disabled:opacity-40"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            id="shell-new-exam-form"
            data-testid="new-exam-form"
            onSubmit={handleCreateExam}
            className="space-y-4 text-sm"
          >
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                {t.drawer.subjectLabel}
              </label>
              <input
                required
                data-testid="new-exam-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.drawer.subjectPlaceholder}
                className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3.5 py-2 text-sm transition focus:border-gold-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                  {t.drawer.universityLabel}
                </label>
                <input
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  placeholder={t.drawer.universityPlaceholder}
                  className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3.5 py-2 text-sm focus:border-gold-700"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                  {t.drawer.degreeLabel}
                </label>
                <input
                  value={degreeCourse}
                  onChange={(e) => setDegreeCourse(e.target.value)}
                  placeholder={t.drawer.degreePlaceholder}
                  className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3.5 py-2 text-sm focus:border-gold-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                  {t.drawer.professorLabel}
                </label>
                <input
                  value={professor}
                  onChange={(e) => setProfessor(e.target.value)}
                  placeholder={t.drawer.professorPlaceholder}
                  className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3.5 py-2 text-sm focus:border-gold-700"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                  {t.drawer.dailyHoursLabel}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="12"
                  value={dailyHours}
                  onChange={(e) => setDailyHours(e.target.value)}
                  className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3.5 py-2 text-sm focus:border-gold-700"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                {t.drawer.examDateLabel}
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3.5 py-2 text-sm focus:border-gold-700"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                {t.drawer.guidanceLabel}
              </label>
              <textarea
                rows={2}
                value={syllabusGuidance}
                onChange={(e) => setSyllabusGuidance(e.target.value)}
                placeholder={t.drawer.guidancePlaceholder}
                className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3.5 py-2 text-xs focus:border-gold-700"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                {t.drawer.materialsLabel}
              </label>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
                  dragActive
                    ? "border-gold-700 bg-gold-100/70"
                    : "border-line bg-sunken/50 hover:border-gold-700"
                }`}
              >
                <Upload className="mb-2 h-5 w-5 text-ink-900" />
                <span className="text-xs font-semibold text-ink-700">{t.drawer.dropTitle}</span>
                <span className="mt-1 text-[11px] text-ink-500">{t.drawer.dropSub}</span>
                <input
                  type="file"
                  data-testid="new-exam-files"
                  accept=".pdf,.png,.jpg,.jpeg"
                  multiple
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </label>

              {selectedFiles.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {selectedFiles.map((f, idx) => (
                    <div
                      key={`${f.name}-${idx}`}
                      className="flex items-center justify-between rounded-lg border border-line bg-sunken px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-ink-900" />
                        <span className="truncate font-medium text-ink-700">{f.name}</span>
                        <span className="shrink-0 text-[10px] text-ink-500">
                          {(f.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded p-1 text-ink-500 hover:bg-danger-soft hover:text-danger"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {createError && (
              <div className="rounded-lg border border-[var(--color-danger)] bg-danger-soft p-3 text-xs font-medium text-danger">
                {createError}
              </div>
            )}
          </form>
        </div>

        <div className="mt-6 space-y-3 border-t border-line pt-4">
          <button
            type="submit"
            form="shell-new-exam-form"
            data-testid="new-exam-submit"
            disabled={creating || !backendOnline}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-ink-900)] px-5 py-2.5 text-sm font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-800)] disabled:opacity-50"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.drawer.creatingBtn}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {t.drawer.submitBtn}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
