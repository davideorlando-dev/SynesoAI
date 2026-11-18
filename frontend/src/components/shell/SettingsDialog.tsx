"use client";

import { useState } from "react";
import { KeyRound, Loader2, Wifi } from "lucide-react";
import { Modal, ModalBadge } from "@/components/ui/Modal";
import { useLanguage } from "@/components/LanguageProvider";
import { AppSettings, testAppSettings, updateAppSettings } from "@/lib/api";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { getSavedUserName, setSavedUserName } from "@/lib/shellStorage";

/**
 * Le impostazioni: nome, chiave Groq, modello, ricerca sul web.
 *
 * Viene montata solo quando si apre, quindi lo stato del modulo nasce ogni
 * volta dalle impostazioni correnti: niente effetti per riempire i campi e
 * nessun esito di una prova di connessione vecchia che resta sullo schermo.
 */
export function SettingsDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: AppSettings | null;
  onClose: () => void;
  onSaved: (updated: AppSettings, userName: string) => void;
}) {
  const { t } = useLanguage();
  const tset = t.settings;
  const errorMessage = useErrorMessage();

  const [nameInput, setNameInput] = useState(() => getSavedUserName());
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState(settings?.llm_model ?? "openai/gpt-oss-120b");
  const [webSearchInput, setWebSearchInput] = useState(settings?.enable_web_search ?? true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      setSavedUserName(nameInput);
      const updated = await updateAppSettings({
        groq_api_key: apiKeyInput.trim() || undefined,
        llm_model: modelInput,
        enable_web_search: webSearchInput,
      });
      onSaved(updated, nameInput.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAppSettings({
        groq_api_key: apiKeyInput.trim() || undefined,
        llm_model: modelInput,
      });
      setTestResult({
        ok: true,
        text: `${tset.connectedPrefix} ${res.model} (${res.latency_ms} ms)`,
      });
    } catch (err) {
      setTestResult({ ok: false, text: errorMessage(err, tset.testFailed) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={tset.title}
      subtitle={tset.subtitle}
      badge={
        <ModalBadge>
          <KeyRound className="h-4 w-4" />
        </ModalBadge>
      }
    >
      <form onSubmit={handleSave} className="space-y-4 text-xs">
        <div>
          <label className="mb-1.5 block font-semibold text-ink-700">{tset.userNameLabel}</label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={tset.userNamePlaceholder}
            className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3 py-2 text-xs focus:border-gold-700"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="font-semibold text-ink-700">{tset.apiKeyLabel}</label>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--color-gold-800)] hover:underline"
            >
              {tset.getFreeKey}
            </a>
          </div>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={
              settings?.has_api_key
                ? `${tset.currentMaskPrefix} ${settings.api_key_masked} ${tset.keepEmptyHint}`
                : "gsk_..."
            }
            className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3 py-2 font-mono text-xs focus:border-gold-700"
          />
        </div>

        <div>
          <label className="mb-1.5 block font-semibold text-ink-700">{tset.modelLabel}</label>
          <select
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            className="w-full rounded-lg border border-line bg-[var(--color-paper)] px-3 py-2 text-xs font-medium text-ink-800 focus:border-gold-700"
          >
            {(settings?.available_models || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-sunken/70 px-3 py-2.5">
          <span className="font-medium text-ink-700">{tset.webSearchLabel}</span>
          <input
            type="checkbox"
            checked={webSearchInput}
            onChange={(e) => setWebSearchInput(e.target.checked)}
          />
        </label>

        {testResult && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              testResult.ok
                ? "border-[var(--color-ok)] bg-ok-soft text-ok"
                : "border-[var(--color-danger)] bg-danger-soft text-danger"
            }`}
          >
            {testResult.text}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gold-200 bg-gold-100/70 px-3 py-2 font-semibold text-ink-900 hover:bg-gold-100/80 disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            {tset.testKey}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line bg-[var(--color-paper)] px-4 py-2 font-semibold text-ink-600 hover:bg-sunken"
            >
              {tset.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-ink-900)] px-4 py-2 font-semibold text-[var(--color-canvas)] hover:bg-[var(--color-ink-800)] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {tset.save}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
