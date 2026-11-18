"use client";

import { useEffect, useRef } from "react";
import { FileText, Loader2, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { KATEX_OPTIONS, normalizeMathDelimiters } from "@/lib/mathDelimiters";
import { useLanguage } from "@/components/LanguageProvider";
import { Topic, TutorMessage } from "@/lib/api";

interface TutorPaneProps {
  /** Argomenti propedeutici a quello aperto, se il piano ne dichiara. */
  prerequisiteTopics: Topic[];
  onSelectTopic: (topic: Topic) => void;
  messages: TutorMessage[];
  /** Apre il PDF citato alla pagina citata. */
  onOpenCitation: (docId: string | null | undefined, page: number) => void;
  /** Senza un argomento aperto non c'è nulla da chiedere: il campo sparisce. */
  hasTopic: boolean;
  onClearThread: () => void;
  input: string;
  onInputChange: (value: string) => void;
  onAsk: () => void;
  asking: boolean;
}

/**
 * Concetti collegati e conversazione col tutor.
 *
 * La conversazione vive nel database e arriva già caricata: qui si mostra, si
 * scrive e si cancella. Lo scorrimento all'ultimo messaggio se lo gestisce
 * questo riquadro, perché riguarda solo lui.
 */
export function TutorPane({
  prerequisiteTopics,
  onSelectTopic,
  messages,
  onOpenCitation,
  hasTopic,
  onClearThread,
  input,
  onInputChange,
  onAsk,
  asking,
}: TutorPaneProps) {
  const { lang, t } = useLanguage();
  const te = t.exam;
  const isEn = lang === "en";
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(
      () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
      80
    );
    return () => clearTimeout(timer);
  }, [messages.length]);

  return (
    <div className="flex flex-1 flex-col justify-between gap-4 overflow-y-auto">
      <div className="space-y-4">
        {prerequisiteTopics.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
              {isEn ? "Connected concepts" : "Concetti collegati"}
            </p>
            <div className="divide-y divide-[var(--color-line)] text-xs">
              {prerequisiteTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => onSelectTopic(topic)}
                  className="flex w-full items-center justify-between py-2 text-left transition hover:text-[var(--color-gold-800)]"
                >
                  <span className="font-medium">{topic.title}</span>
                  <span className="text-[10px] text-ink-500">{topic.priority}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={prerequisiteTopics.length > 0 ? "border-t border-[var(--color-line)] pt-3" : ""}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
            {te.tutorHeader}
          </p>
          {messages.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] p-3.5 text-xs leading-relaxed text-ink-600">
              {isEn
                ? "Ask for an example, comparison, or select any sentence in your notes for an instant explanation."
                : "Chiedi un esempio, un confronto o seleziona una frase negli appunti per chiarirla subito sui tuoi PDF."}
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  data-testid="tutor-message"
                  className="rounded-xl border border-[var(--color-gold-200)] bg-[var(--color-gold-100)]/35 p-3 text-xs"
                >
                  <p className="font-bold text-[var(--color-ink-900)]">{message.question}</p>
                  {message.selectedText && (
                    <p className="mt-1 line-clamp-2 border-l-2 border-[var(--color-gold-200)] pl-2 italic text-ink-500">
                      &ldquo;{message.selectedText}&rdquo;
                    </p>
                  )}
                  <div className="prose-syneso mt-2 leading-relaxed text-ink-700">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
                    >
                      {normalizeMathDelimiters(message.answerMarkdown)}
                    </ReactMarkdown>
                  </div>
                  {message.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.citations.map((citation, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => onOpenCitation(citation.doc_id, citation.page_number)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gold-200)] bg-[var(--color-paper)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-gold-800)] transition hover:bg-[var(--color-gold-100)]"
                        >
                          <FileText className="h-2.5 w-2.5" />
                          {citation.filename ? `${citation.filename} • ` : ""}
                          {te.pageShort} {citation.page_number}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {hasTopic && (
        <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearThread}
              className="text-[11px] font-medium text-ink-500 hover:text-ink-700"
            >
              {te.clearChat}
            </button>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onAsk();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              data-testid="tutor-input"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              disabled={asking}
              placeholder={te.tutorPlaceholder}
              className="flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-sunken)] px-3 py-2 text-xs transition focus:border-[var(--color-gold-700)] focus:bg-[var(--color-paper)]"
            />
            <button
              type="submit"
              data-testid="tutor-send"
              disabled={asking || input.trim().length < 2}
              className="inline-flex items-center gap-1 rounded-xl bg-[var(--color-ink-900)] px-3 py-2 text-xs font-semibold text-[var(--color-canvas)] transition hover:bg-[var(--color-ink-900)] disabled:opacity-40"
            >
              {asking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
