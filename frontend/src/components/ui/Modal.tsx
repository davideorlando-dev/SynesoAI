"use client";

import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * Il riquadro quadrato accanto al titolo di una finestra.
 *
 * Sta qui perché ogni finestra ne ha uno e, scritto a mano ogni volta, finiva
 * per avere misure e raggi diversi da una all'altra.
 */
export function ModalBadge({
  tone = "brand",
  children,
}: {
  /** brand: riquadro pieno indaco, per le azioni. light: fondo chiaro, per il marchio. */
  tone?: "brand" | "light";
  children: ReactNode;
}) {
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        tone === "brand" ? "bg-[var(--color-ink-900)] text-[var(--color-canvas)]" : "border border-[var(--color-line)] bg-[var(--color-gold-100)]"
      }`}
    >
      {children}
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  /** Larghezza massima: «md» per un modulo, «2xl» per una finestra di testo. */
  width?: "md" | "2xl";
  children: ReactNode;
}

/**
 * La finestra modale dell'applicazione.
 *
 * Esiste perché «Impostazioni» e «Guida» erano due finestre scritte due volte,
 * con due opacità di sfondo, due raggi, due spaziature e due dimensioni di
 * titolo: differenze che nessuno aveva deciso. Da qui in poi una finestra
 * nuova nasce già allineata alle altre, e chiudere con Esc o cliccando fuori
 * funziona ovunque senza che qualcuno debba ricordarsene.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  badge,
  width = "md",
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-scrim)] p-4 backdrop-blur-xs"
    >
      <div
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[85vh] w-full flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-6 shadow-2xl ${
          width === "2xl" ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--color-line)] pb-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {badge}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-[var(--color-ink-900)]">{title}</h2>
              {subtitle && <p className="truncate text-[11px] text-ink-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-lg p-1 text-ink-400 transition hover:bg-[var(--color-sunken)] hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
