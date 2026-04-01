"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

export type ToastVariant = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
};

export type ToastStore = {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => ToastItem[];
  addToast: (options: ToastOptions | string) => void;
  removeToast: (id: string) => void;
};

type ToastOptions = {
  message: string;
  variant?: ToastVariant;
  duration?: number;
};

const MAX_TOASTS = 5;

export function createToastStore(): ToastStore {
  let toasts: ToastItem[] = [];
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function emit() {
    for (const cb of listeners) cb();
  }

  function removeToast(id: string) {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }

  function addToast(options: ToastOptions | string) {
    const opts = typeof options === "string" ? { message: options } : options;
    const id = crypto.randomUUID();
    const duration = opts.duration ?? 3000;

    const item: ToastItem = {
      id,
      message: opts.message,
      variant: opts.variant ?? "info",
      duration,
    };

    toasts = [...toasts, item];
    if (toasts.length > MAX_TOASTS) {
      const oldest = toasts[0];
      removeToast(oldest.id);
    }

    timers.set(
      id,
      setTimeout(() => removeToast(id), duration),
    );

    emit();
  }

  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot: () => toasts,
    addToast,
    removeToast,
  };
}

export const ToastContext = createContext<ToastStore | null>(null);

export function useToast() {
  const store = useContext(ToastContext);
  if (!store) throw new Error("useToast must be used within ToastProvider");

  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const toast = useCallback(
    (options: ToastOptions | string) => store.addToast(options),
    [store],
  );

  const dismiss = useCallback(
    (id: string) => store.removeToast(id),
    [store],
  );

  return { toasts, toast, dismiss };
}
