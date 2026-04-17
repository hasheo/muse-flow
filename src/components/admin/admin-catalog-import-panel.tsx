"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { CheckCircle2, ListPlus, Loader2, Sparkles, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type PreviewTrack = {
  youtubeVideoId: string;
  title: string;
  artist: string;
  duration: number;
  cover: string;
  alreadyInCatalog: boolean;
};

type PreviewResponse = {
  playlistId: string;
  tracks: PreviewTrack[];
};

type BatchResult = {
  youtubeVideoId: string;
  status: "created" | "duplicate" | "error";
  message?: string;
};

const BATCH_SIZE = 10;

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

async function fetchPreview(playlistUrl: string): Promise<PreviewResponse> {
  const response = await fetch("/api/admin/catalog/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playlistUrl }),
  });
  const payload = (await response.json()) as Partial<PreviewResponse> & { message?: string };
  if (!response.ok || !payload.tracks) throw new Error(payload.message || "Preview failed");
  return payload as PreviewResponse;
}

async function importBatch(
  tracks: Array<{
    youtubeVideoId: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    cover: string;
    category: string | null;
  }>,
  enrich: boolean,
): Promise<BatchResult[]> {
  const response = await fetch("/api/admin/catalog/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracks, enrich }),
  });
  const payload = (await response.json()) as { results?: BatchResult[]; message?: string };
  if (!response.ok || !payload.results) throw new Error(payload.message || "Import failed");
  return payload.results;
}

export function AdminCatalogImportPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [enrich, setEnrich] = useState(true);
  const [progress, setProgress] = useState<{
    total: number;
    done: number;
    created: number;
    duplicate: number;
    error: number;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const previewMutation = useMutation({
    mutationFn: fetchPreview,
    onSuccess: (result) => {
      setPreview(result);
      setProgress(null);
      // Pre-select everything not already in the catalog.
      const fresh = new Set(
        result.tracks.filter((t) => !t.alreadyInCatalog).map((t) => t.youtubeVideoId),
      );
      setSelected(fresh);
    },
    onError: (err: Error) => toast({ message: err.message, variant: "error" }),
  });

  const stats = useMemo(() => {
    if (!preview) return null;
    const inCatalog = preview.tracks.filter((t) => t.alreadyInCatalog).length;
    return {
      total: preview.tracks.length,
      inCatalog,
      selectable: preview.tracks.length - inCatalog,
    };
  }, [preview]);

  const toggleSelect = (youtubeVideoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(youtubeVideoId)) next.delete(youtubeVideoId);
      else next.add(youtubeVideoId);
      return next;
    });
  };

  const selectAllFresh = () => {
    if (!preview) return;
    setSelected(
      new Set(preview.tracks.filter((t) => !t.alreadyInCatalog).map((t) => t.youtubeVideoId)),
    );
  };

  const clearSelection = () => setSelected(new Set());

  const runImport = async () => {
    if (!preview) return;
    const queue = preview.tracks.filter((t) => selected.has(t.youtubeVideoId));
    if (!queue.length) return;

    setIsImporting(true);
    setProgress({ total: queue.length, done: 0, created: 0, duplicate: 0, error: 0 });

    const category = bulkCategory.trim() || null;

    try {
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const chunk = queue.slice(i, i + BATCH_SIZE).map((t) => ({
          youtubeVideoId: t.youtubeVideoId,
          title: t.title,
          artist: t.artist,
          album: "",
          duration: t.duration,
          cover: t.cover,
          category,
        }));

        const results = await importBatch(chunk, enrich);

        setProgress((prev) => {
          if (!prev) return prev;
          const next = { ...prev, done: prev.done + results.length };
          for (const r of results) {
            if (r.status === "created") next.created += 1;
            else if (r.status === "duplicate") next.duplicate += 1;
            else next.error += 1;
          }
          return next;
        });
      }

      queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
      toast({ message: "Import complete", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      toast({ message, variant: "error" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-4 shadow-lg shadow-cyan-500/5">
      <div className="flex items-start justify-between">
        <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-cyan-200">
          <ListPlus className="h-4 w-4" />
          Import from YouTube Music playlist
        </p>
        <button
          aria-label="Close"
          className="rounded-md p-1 text-white/60 transition hover:text-white"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          className="flex-1"
          onChange={(event) => setPlaylistUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && playlistUrl.trim()) {
              event.preventDefault();
              previewMutation.mutate(playlistUrl);
            }
          }}
          placeholder="Paste a YouTube Music playlist URL or ID (e.g. PLxxx)"
          value={playlistUrl}
        />
        <Button
          disabled={!playlistUrl.trim() || previewMutation.isPending}
          onClick={() => previewMutation.mutate(playlistUrl)}
          type="button"
        >
          {previewMutation.isPending ? "Fetching..." : "Fetch"}
        </Button>
      </div>

      {preview && stats ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
            <span>
              {stats.total} tracks · {stats.inCatalog} already in catalog ·{" "}
              <span className="font-semibold text-white">{selected.size} selected</span>
            </span>
            <div className="flex gap-2">
              <button
                className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
                onClick={selectAllFresh}
                type="button"
              >
                Select all new
              </button>
              <button
                className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
                onClick={clearSelection}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                Category (applied to every imported track)
              </span>
              <Input
                onChange={(event) => setBulkCategory(event.target.value)}
                placeholder="e.g. Anime OST"
                value={bulkCategory}
              />
            </label>
            <label className="flex items-end gap-2 pb-0.5">
              <input
                checked={enrich}
                className="h-4 w-4 rounded border-white/20 bg-black/40"
                onChange={(event) => setEnrich(event.target.checked)}
                type="checkbox"
              />
              <span className="flex items-center gap-1.5 text-xs text-white/70">
                <Sparkles className="h-3.5 w-3.5 text-lime-300" />
                Auto-enrich year / country / genre (slower)
              </span>
            </label>
          </div>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-white/10 bg-black/30">
            <ul className="divide-y divide-white/5">
              {preview.tracks.map((track) => {
                const isChecked = selected.has(track.youtubeVideoId);
                return (
                  <li
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${
                      track.alreadyInCatalog ? "opacity-50" : ""
                    }`}
                    key={track.youtubeVideoId}
                  >
                    <input
                      checked={isChecked}
                      className="h-4 w-4 rounded border-white/20 bg-black/40"
                      disabled={track.alreadyInCatalog || isImporting}
                      onChange={() => toggleSelect(track.youtubeVideoId)}
                      type="checkbox"
                    />
                    <Image
                      alt=""
                      className="h-9 w-9 rounded object-cover"
                      height={36}
                      src={track.cover}
                      unoptimized
                      width={36}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{track.title}</p>
                      <p className="truncate text-xs text-white/55">{track.artist}</p>
                    </div>
                    {track.alreadyInCatalog ? (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">
                        In catalog
                      </span>
                    ) : null}
                    <span className="text-xs text-white/40">{formatDuration(track.duration)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {progress ? <ImportProgressBar progress={progress} /> : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={!selected.size || isImporting}
              onClick={runImport}
              type="button"
            >
              {isImporting
                ? `Importing ${progress?.done ?? 0} / ${progress?.total ?? selected.size}...`
                : `Import ${selected.size} track${selected.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImportProgressBar({
  progress,
}: {
  progress: { total: number; done: number; created: number; duplicate: number; error: number };
}) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const isDone = progress.done >= progress.total;
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-3">
      <div className="flex items-center gap-2 text-xs text-white/80">
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-lime-300" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        )}
        <span>
          {progress.done} / {progress.total} processed
        </span>
        <span className="ml-auto text-white/50">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-lime-400 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-white/60">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-lime-300" />
          {progress.created} added
        </span>
        <span className="inline-flex items-center gap-1 text-white/50">
          {progress.duplicate} duplicate
        </span>
        {progress.error > 0 ? (
          <span className="inline-flex items-center gap-1 text-rose-200">
            <XCircle className="h-3.5 w-3.5" />
            {progress.error} failed
          </span>
        ) : null}
      </div>
    </div>
  );
}
