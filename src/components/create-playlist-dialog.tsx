"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CreatePlaylistDialogProps = {
  open: boolean;
  isCreating: boolean;
  onCancel: () => void;
  onConfirm: (name: string, cover: string) => void;
};

export function CreatePlaylistDialog({
  open,
  isCreating,
  onCancel,
  onConfirm,
}: CreatePlaylistDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [cover, setCover] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      setName("");
      setCover("");
      setError(null);
      nameInputRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (!isCreating) onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocusRef.current?.focus();
    };
  }, [isCreating, onCancel, open]);

  if (!open) return null;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Playlist name is required.");
      return;
    }
    setError(null);
    onConfirm(trimmed, cover.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isCreating) onCancel();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-5 shadow-2xl"
        ref={dialogRef}
        role="dialog"
      >
        <p className="text-lg font-semibold text-white" id={titleId}>
          Create Quiz Playlist
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60" htmlFor={`${titleId}-name`}>
              Playlist Name
            </label>
            <Input
              ref={nameInputRef}
              id={`${titleId}-name`}
              onChange={(e) => setName(e.target.value)}
              placeholder="My awesome quiz..."
              value={name}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60" htmlFor={`${titleId}-cover`}>
              Cover URL (optional)
            </label>
            <Input
              id={`${titleId}-cover`}
              onChange={(e) => setCover(e.target.value)}
              placeholder="https://..."
              value={cover}
            />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button disabled={isCreating} onClick={onCancel} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isCreating} type="submit">
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
