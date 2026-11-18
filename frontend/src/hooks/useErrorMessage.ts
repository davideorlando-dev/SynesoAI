"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { describeError } from "@/lib/errors";

/**
 * Returns a function that turns a caught error into a message in the current
 * language. Its identity is stable, so it can be listed in dependency arrays
 * without re-running effects when the language changes.
 */
export function useErrorMessage() {
  const { t } = useLanguage();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  return useCallback(
    (err: unknown, fallback?: string) => describeError(err, tRef.current, fallback),
    []
  );
}
