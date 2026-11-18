"use client";

import { MouseEvent, ReactNode, RefObject } from "react";
import { CheckCircle2, Loader2, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { Highlight, Topic } from "@/lib/api";
import { FlashcardsController } from "@/hooks/useFlashcards";
import { TopicNotesController } from "@/hooks/useTopicNotes";

interface TopicNotesPanelProps {
  topic: Topic;
  notes: TopicNotesController;
  flashcards: FlashcardsController;
  /** Concetti chiave estratti dal materiale, con la pagina da cui vengono. */
  highlights: Highlight[];
  /** Testo mostrato: quello in arrivo durante la generazione, poi quello salvato. */
  displayedNotes: string;
  /** Il markdown gia' disegnato, che la pagina costruisce una volta sola. */
  renderedNotesNode: ReactNode;
  /**
   * Il contenitore degli appunti. Resta della pagina perche' e' lei a
   * riavvolgere le evidenziazioni dentro il testo disegnato, lavorando sul DOM
   * dopo ogni disegno.
   */
  notesContainerRef: RefObject<HTMLDivElement | null>;
  onNotesClick: (event: MouseEvent<HTMLDivElement>) => void;
  onNotesMouseUp: () => void;
  onSynthesize: (force: boolean) => void;
  onOpenPdfAt: (docId: string | null | undefined, page: number) => void;
  onCloseSelectionPopup: () => void;
}

/**
 * Gli appunti dell'argomento: generazione, concetti chiave, editor e testo.
 *
 * Non e' un riquadro autonomo come gli altri: selezione del testo ed
 * evidenziazioni vivono a cavallo fra questo markup e il DOM che la pagina
 * manipola dopo il disegno, quindi il contenitore e i suoi gestori arrivano da
 * fuori. Separarli del tutto vorrebbe dire spostare anche quella logica, ed e'
 * un intervento che merita un passo suo.
 */
export function TopicNotesPanel({
  topic,
  notes,
  flashcards,
  highlights,
  displayedNotes,
  renderedNotesNode,
  notesContainerRef,
  onNotesClick,
  onNotesMouseUp,
  onSynthesize,
  onOpenPdfAt,
  onCloseSelectionPopup,
}: TopicNotesPanelProps) {
  const { t } = useLanguage();
  const te = t.exam;

  return (
  <div className="space-y-6">
    {!displayedNotes && !notes.synthesizing ? (
      <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-sunken)] p-8 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-gold-200)] bg-[var(--color-gold-100)] text-[var(--color-gold-800)]">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="mx-auto mb-5 max-w-md text-xs leading-relaxed text-ink-600">
          {te.emptyNotesDesc}
        </p>
        <button
          onClick={() => onSynthesize(false)}
          data-testid="generate-notes"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-ink-900)] px-5 py-2.5 text-xs font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-900)]"
        >
          <Sparkles className="h-3.5 w-3.5" /> {te.generateNotesBtn}
        </button>
      </div>
    ) : (
      <>
        {notes.synthesizing && notes.phase && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-gold-200)] bg-[var(--color-gold-100)]/60 px-3.5 py-2.5 text-xs font-semibold text-[var(--color-gold-800)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-gold-800)]" />
            <span>{notes.phase}</span>
          </div>
        )}

        {!notes.synthesizing && highlights.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
              {te.citationsHeader}
            </h3>
            <div className="grid gap-2">
              {highlights.map((h, i) => (
                <button
                  key={i}
                  onClick={() => onOpenPdfAt(h.doc_id, h.page_number)}
                  className="group rounded-xl border border-[var(--color-warn)]/80 bg-[var(--color-warn-soft)]/50 p-3 text-left transition hover:border-[var(--color-warn)] hover:bg-[var(--color-warn-soft)]"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[var(--color-warn)]/80 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-warn)]">
                        {te.pageShort} {h.page_number}
                      </span>
                      {h.filename && (
                        <span className="max-w-[160px] truncate text-[10px] font-medium text-[var(--color-warn)]/70">
                          {h.filename}
                        </span>
                      )}
                      {h.verified === true && (
                        <span className="rounded bg-[var(--color-ok-soft)]/80 px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-ok)]">
                          {te.citationVerified}
                        </span>
                      )}
                      {h.verified === false && (
                        <span className="rounded bg-[var(--color-warn-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-warn)]">
                          {te.citationUnverified}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--color-warn)] opacity-0 transition group-hover:opacity-100">
                      {te.jumpToPage}
                    </span>
                  </div>
                  <p className="text-xs font-medium italic leading-relaxed text-ink-800">
                    &ldquo;{h.quote}&rdquo;
                  </p>
                  <p className="mt-1 text-[11px] text-ink-600">
                    {h.why_it_matters}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] pt-4">
            <div className="flex items-center gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                {te.notesHeader}
              </h3>
              {!notes.synthesizing && !notes.editing && (
                <span className="hidden rounded bg-[var(--color-sunken)] px-1.5 py-0.5 text-[10px] text-ink-500 sm:inline">
                  {te.selectionHint}
                </span>
              )}
            </div>
            {!notes.synthesizing && (
              <div
                data-testid="notes-toolbar"
                className="flex flex-wrap items-center gap-1.5"
              >
                <button
                  onClick={() => {
                    onCloseSelectionPopup();
                    if (notes.editing) {
                      notes.stopEditing();
                    } else {
                      notes.startEditing(topic.notes_markdown || "");
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 text-xs font-semibold text-ink-700 transition hover:bg-[var(--color-sunken)]"
                >
                  <Pencil className="h-3 w-3" />{" "}
                  {notes.editing ? te.closeEditor : te.editNotes}
                </button>
                <button
                  onClick={() => void flashcards.generateMore(topic.id)}
                  disabled={flashcards.generatingExtra || notes.editing}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-gold-100)] px-2.5 py-1 text-xs font-semibold text-[var(--color-gold-800)] transition hover:bg-[var(--color-gold-100)] disabled:opacity-50"
                >
                  {flashcards.generatingExtra ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> {te.creatingCards}
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" /> {te.add5Cards}
                    </>
                  )}
                </button>
                <button
                  onClick={() => onSynthesize(true)}
                  disabled={flashcards.generatingExtra || notes.editing}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-500 transition hover:bg-[var(--color-sunken)] hover:text-ink-800 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" /> {te.regenerate}
                </button>
              </div>
            )}
          </div>

          {(flashcards.notice || flashcards.creatingFromSelection) && (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-ok)] bg-[var(--color-ok-soft)]/70 px-3 py-2 text-xs font-medium text-[var(--color-ok)]">
              {flashcards.creatingFromSelection ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-ok)]" />
                  {te.creatingSelectionCard}
                </>
              ) : (
                flashcards.notice
              )}
            </div>
          )}

          {notes.editing ? (
            <div className="space-y-3">
              <textarea
                rows={14}
                value={notes.draft}
                onChange={(e) => notes.setDraft(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)]/50 p-3.5 font-mono text-xs leading-relaxed text-ink-800 focus:border-[var(--color-gold-700)] focus:bg-[var(--color-paper)]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={notes.stopEditing}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-[var(--color-sunken)]"
                >
                  {te.cancel}
                </button>
                <button
                  type="button"
                  disabled={notes.saving || !notes.draft.trim()}
                  onClick={() => void notes.saveEdits(topic.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-ink-900)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-canvas)] hover:bg-[var(--color-ink-900)] disabled:opacity-50"
                >
                  {notes.saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {te.saveChanges}
                </button>
              </div>
            </div>
          ) : (
            <div
                ref={notesContainerRef}
                data-testid="notes-body"
                onMouseUp={onNotesMouseUp}
                onClick={onNotesClick}
                className="prose-syneso select-text text-[14px] leading-relaxed text-ink-800 selection:bg-[var(--color-gold-200)] selection:text-[var(--color-ink-900)]"
              >
                {renderedNotesNode}
              </div>
          )}
        </div>
      </>
    )}
  </div>
  );
}
