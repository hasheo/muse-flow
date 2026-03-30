import { useCallback, useRef } from "react";

export interface UseQuizTimersReturn {
  snippetTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  answerIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  pendingSnippetStartRef: React.MutableRefObject<{
    reject: (error: Error) => void;
    resolve: () => void;
  } | null>;
  clearTimers: () => void;
  cancelPendingSnippetStart: (message: string) => void;
}

export function useQuizTimers(): UseQuizTimersReturn {
  const snippetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSnippetStartRef = useRef<{
    reject: (error: Error) => void;
    resolve: () => void;
  } | null>(null);

  const clearTimers = useCallback(() => {
    if (snippetTimeoutRef.current) {
      clearTimeout(snippetTimeoutRef.current);
      snippetTimeoutRef.current = null;
    }
    if (answerIntervalRef.current) {
      clearInterval(answerIntervalRef.current);
      answerIntervalRef.current = null;
    }
  }, []);

  const cancelPendingSnippetStart = useCallback((message: string) => {
    pendingSnippetStartRef.current?.reject(new Error(message));
    pendingSnippetStartRef.current = null;
  }, []);

  return {
    snippetTimeoutRef,
    answerIntervalRef,
    pendingSnippetStartRef,
    clearTimers,
    cancelPendingSnippetStart,
  };
}
