"use client";

import { useEffect, useId, useRef } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Track } from "@/lib/catalog";

type ManageTracksDialogProps = {
  open: boolean;
  playlistName: string;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  isSearching: boolean;
  searchError: string | null;
  searchResults: Track[];
  searchResultsContainerRef: React.RefObject<HTMLDivElement | null>;
  searchSentinelRef: React.RefObject<HTMLDivElement | null>;
  isLoadingMoreSearch: boolean;
  hasMoreSearchResults: boolean;
  existingTrackIds: Set<string>;
  savingTrackId: string | null;
  removingTrackId: string | null;
  previewingTrackId: string | null;
  snippetDurationSeconds: number;
  onPreview: (track: Track) => void;
  onStopPreview: () => void;
  onAddTrack: (track: Track) => void;
  onRemoveTrack: (trackId: string) => void;
  currentTracks: Track[];
  onClose: () => void;
};

export function ManageTracksDialog({
  open,
  playlistName,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  isSearching,
  searchError,
  searchResults,
  searchResultsContainerRef,
  searchSentinelRef,
  isLoadingMoreSearch,
  hasMoreSearchResults,
  existingTrackIds,
  savingTrackId,
  removingTrackId,
  previewingTrackId,
  snippetDurationSeconds,
  onPreview,
  onStopPreview,
  onAddTrack,
  onRemoveTrack,
  currentTracks,
  onClose,
}: ManageTracksDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-white/15 bg-zinc-950 shadow-2xl"
        ref={dialogRef}
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <p className="text-lg font-semibold text-white" id={titleId}>
            Manage Tracks
          </p>
          <button
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Search section */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
              Add Tracks to &ldquo;{playlistName}&rdquo;
            </p>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                onSearch(searchQuery);
              }}
            >
              <Input
                ref={searchInputRef}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search YouTube tracks..."
                value={searchQuery}
              />
              <Button disabled={isSearching} type="submit">
                {isSearching ? "Searching..." : "Search"}
              </Button>
            </form>
            {searchError ? (
              <p className="mt-2 text-sm text-red-300">{searchError}</p>
            ) : null}

            {searchResults.length ? (
              <div
                className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1"
                ref={searchResultsContainerRef}
              >
                {searchResults.map((track) => {
                  const alreadyAdded = existingTrackIds.has(track.id);
                  return (
                    <div
                      className="flex flex-col gap-2 rounded-lg border border-white/10 px-3 py-2.5"
                      key={track.id}
                    >
                      <div className="flex items-center gap-3">
                        <Image
                          alt={track.title}
                          className="h-12 w-12 shrink-0 rounded-md object-cover"
                          height={48}
                          src={track.cover}
                          width={48}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {track.title}
                          </p>
                          <p className="truncate text-sm text-white/65">
                            {track.artist}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          className="h-8 px-3"
                          onClick={() => {
                            if (previewingTrackId === track.id) {
                              onStopPreview();
                              return;
                            }
                            onPreview(track);
                          }}
                          type="button"
                          variant="ghost"
                        >
                          {previewingTrackId === track.id
                            ? "Stop"
                            : `Preview ${snippetDurationSeconds}s`}
                        </Button>
                        <Button
                          className="h-8 px-3"
                          disabled={alreadyAdded || savingTrackId === track.id}
                          onClick={() => onAddTrack(track)}
                          type="button"
                          variant="ghost"
                        >
                          {alreadyAdded
                            ? "Added"
                            : savingTrackId === track.id
                              ? "Adding..."
                              : "Add"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <div ref={searchSentinelRef} />
                {isLoadingMoreSearch ? (
                  <p className="px-1 py-2 text-xs text-white/65">
                    Loading more results...
                  </p>
                ) : null}
                {!hasMoreSearchResults ? (
                  <p className="px-1 py-2 text-xs text-white/45">
                    No more results.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Current tracks section */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
              Current Tracks ({currentTracks.length})
            </p>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {currentTracks.map((track) => (
                <div
                  className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5"
                  key={track.id}
                >
                  <Image
                    alt={track.title}
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                    height={40}
                    src={track.cover}
                    width={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{track.title}</p>
                    <p className="truncate text-sm text-white/65">
                      {track.artist}
                    </p>
                  </div>
                  <Button
                    className="ml-auto h-8 shrink-0 px-3"
                    disabled={removingTrackId === track.id}
                    onClick={() => onRemoveTrack(track.id)}
                    type="button"
                    variant="ghost"
                  >
                    {removingTrackId === track.id ? "Removing..." : "Remove"}
                  </Button>
                </div>
              ))}
              {!currentTracks.length ? (
                <p className="text-xs text-white/65">
                  No tracks in this playlist yet.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-3">
          <div className="flex justify-end">
            <Button onClick={onClose} type="button">
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
