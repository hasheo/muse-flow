"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import {
  createToastStore,
  ToastContext,
  useToast,
  type ToastItem,
} from "@/hooks/use-toast";

const toastVariants = cva(
  "pointer-events-auto flex w-96 items-center gap-3 rounded-xl border px-5 py-4 text-base shadow-lg animate-[toast-slide-in_0.25s_ease-out]",
  {
    variants: {
      variant: {
        success: "border-lime-300/30 bg-lime-950/90 text-lime-200",
        error: "border-red-300/30 bg-red-950/90 text-red-200",
        info: "border-white/15 bg-zinc-900/95 text-white/85",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

function ToastEntry({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  return (
    <div className={cn(toastVariants({ variant: item.variant }))} role="status" aria-live="polite">
      <span className="flex-1">{item.message}</span>
      <button
        className="shrink-0 rounded-md p-1 transition hover:bg-white/10"
        onClick={onDismiss}
        type="button"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ToastViewport() {
  const { toasts, dismiss } = useToast();

  if (typeof document === "undefined" || toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed top-6 right-6 z-[100] flex flex-col gap-3">
      {toasts.map((item) => (
        <ToastEntry key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
      ))}
    </div>,
    document.body,
  );
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createToastStore());

  return (
    <ToastContext.Provider value={store}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

export { ToastProvider, ToastViewport };
