"use client";

import { Modal, ModalBadge } from "@/components/ui/Modal";
import { SynesoSymbol } from "@/components/SynesoLogo";
import { useLanguage } from "@/components/LanguageProvider";

/** La finestra «Guida»: che cos'è Syneso, a cosa serve, dove stanno i dati. */
export function AboutDialog({
  appVersion,
  onClose,
}: {
  appVersion?: string | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const ta = t.about;

  return (
    <Modal
      open
      onClose={onClose}
      title={ta.title}
      subtitle={ta.subtitle}
      badge={
        <ModalBadge tone="light">
          <SynesoSymbol className="h-5 w-5" />
        </ModalBadge>
      }
      width="2xl"
    >
      <div className="space-y-4 text-xs leading-relaxed text-ink-600">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4">
          <h3 className="text-sm font-bold text-[var(--color-ink-900)]">{ta.originTitle}</h3>
          <p className="mt-1.5">{ta.originBody}</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4">
          <h3 className="text-sm font-bold text-[var(--color-ink-900)]">{ta.goalTitle}</h3>
          <p className="mt-1.5">{ta.goalBody}</p>
        </div>
        <div className="rounded-2xl border border-gold-100 bg-[var(--color-gold-100)]/50 p-4">
          <h3 className="text-sm font-bold text-[var(--color-ink-900)]">{ta.privacyTitle}</h3>
          <p className="mt-1.5 text-[var(--color-ink-900)]/90">{ta.privacyBody}</p>
        </div>
        <p className="border-t border-line pt-3 text-[11px] text-ink-500">
          {appVersion && (
            <span className="font-mono font-semibold text-ink-500">Syneso {appVersion}</span>
          )}{" "}
          {ta.licenseLine}{" "}
          <a
            href="https://github.com/davideorlando-dev/SynesoAI"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--color-gold-800)] hover:underline"
          >
            github.com/davideorlando-dev/SynesoAI
          </a>
        </p>
      </div>
    </Modal>
  );
}
