"use client";

import { ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { DocumentInfo, getPdfUrl } from "@/lib/api";

interface PdfPaneProps {
  documents: DocumentInfo[];
  /** Documento mostrato, o null finché non ce n'è uno. */
  selectedDocId: string | null;
  onSelectDoc: (docId: string) => void;
  page: number;
  /**
   * Cambia a ogni richiesta di salto, anche verso la pagina già aperta: è ciò
   * che costringe il visore a ricaricarsi e a muoversi davvero.
   */
  jumpKey: number;
  wide: boolean;
  onToggleWide: () => void;
}

/** Il visore dei PDF importati, con la scelta del documento e la pagina corrente. */
export function PdfPane({
  documents,
  selectedDocId,
  onSelectDoc,
  page,
  jumpKey,
  wide,
  onToggleWide,
}: PdfPaneProps) {
  const { t } = useLanguage();
  const te = t.exam;

  if (!selectedDocId) {
    return <p className="p-6 text-center text-xs text-ink-500">No PDF</p>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="mb-2 flex items-center justify-between text-xs">
        <select
          value={selectedDocId}
          onChange={(event) => onSelectDoc(event.target.value)}
          className="max-w-[170px] truncate bg-transparent font-semibold text-ink-700"
        >
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.filename}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleWide}
            className="rounded-lg border border-[var(--color-line)] px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-[var(--color-sunken)]"
          >
            {wide ? te.shrinkPdf : te.expandPdf}
          </button>
          <a
            href={getPdfUrl(selectedDocId, page)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-[var(--color-line)] px-1.5 py-0.5 text-ink-600 hover:bg-[var(--color-sunken)]"
            title={te.openPdfNewTab}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <span className="rounded-lg bg-[var(--color-sunken)] px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-700">
            {te.pageShort} {page}
          </span>
        </div>
      </div>
      <iframe
        key={`${selectedDocId}-${page}-${jumpKey}`}
        src={getPdfUrl(selectedDocId, page, jumpKey)}
        className="min-h-[60vh] w-full flex-1 rounded-xl border border-[var(--color-line)]"
        title="PDF Viewer"
      />
    </div>
  );
}
