"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { ListPlus, Loader2, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminCatalogImportPanel } from "@/components/admin/admin-catalog-import-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import type { Track } from "@/lib/catalog";

const BULK_PLAIN_BATCH = 50;
const BULK_ENRICH_BATCH = 10;

type BulkPatch = {
  category?: string;
  country?: string;
  year?: number;
  genre?: string;
};

type BulkUpdateResponse = {
  updated: number;
  skipped?: number;
  errors?: number;
};

async function bulkUpdateCatalog(input: { ids: string[]; patch: BulkPatch; enrich: boolean }) {
  const response = await fetch("/api/admin/catalog/bulk-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as BulkUpdateResponse & {
    message?: string;
  };
  if (!response.ok) throw new Error(payload.message || "Bulk update failed");
  return payload;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type CatalogTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  youtubeVideoId: string;
  year: number | null;
  country: string | null;
  category: string | null;
  genre: string | null;
  musicbrainzId: string | null;
  updatedAt: string;
};

type EnrichmentResult = {
  year: number | null;
  country: string | null;
  genre: string | null;
  musicbrainzId: string | null;
  confidence: number;
  sources: Array<"musicbrainz" | "discogs">;
};

type DraftState = {
  base: Track | null;
  title: string;
  artist: string;
  album: string;
  year: string;
  country: string;
  category: string;
  genre: string;
  musicbrainzId: string | null;
};

const EMPTY_DRAFT: DraftState = {
  base: null,
  title: "",
  artist: "",
  album: "",
  year: "",
  country: "",
  category: "",
  genre: "",
  musicbrainzId: null,
};

async function fetchCatalog(q: string): Promise<CatalogTrack[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  const response = await fetch(`/api/admin/catalog?${params.toString()}`, { cache: "no-store" });
  const payload = (await response.json()) as { tracks?: CatalogTrack[]; message?: string };
  if (!response.ok) throw new Error(payload.message || "Failed to load catalog");
  return payload.tracks ?? [];
}

async function searchYouTube(q: string): Promise<Track[]> {
  const params = new URLSearchParams({ q });
  const response = await fetch(`/api/youtube/search?${params.toString()}`, { cache: "no-store" });
  const payload = (await response.json()) as { tracks?: Track[]; message?: string };
  if (!response.ok) throw new Error(payload.message || "YouTube search failed");
  return payload.tracks ?? [];
}

async function enrichMetadata(title: string, artist: string): Promise<EnrichmentResult> {
  const response = await fetch("/api/admin/catalog/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, artist }),
  });
  const payload = (await response.json()) as { enrichment?: EnrichmentResult; message?: string };
  if (!response.ok || !payload.enrichment) throw new Error(payload.message || "Enrichment failed");
  return payload.enrichment;
}

async function createCatalogTrack(input: {
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  youtubeVideoId: string;
  year: number | null;
  country: string | null;
  category: string | null;
  genre: string | null;
  musicbrainzId: string | null;
}) {
  const response = await fetch("/api/admin/catalog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as { track?: CatalogTrack; message?: string };
  if (!response.ok || !payload.track) throw new Error(payload.message || "Failed to create track");
  return payload.track;
}

async function updateCatalogTrack(id: string, patch: Record<string, unknown>) {
  const response = await fetch(`/api/admin/catalog/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = (await response.json()) as { track?: CatalogTrack; message?: string };
  if (!response.ok || !payload.track) throw new Error(payload.message || "Failed to update track");
  return payload.track;
}

async function deleteCatalogTrack(id: string) {
  const response = await fetch(`/api/admin/catalog/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message || "Failed to delete track");
  }
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AdminCatalogView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(searchFilter), 200);
    return () => clearTimeout(timer);
  }, [searchFilter]);

  const { data: tracks = [], isLoading, error } = useQuery({
    queryKey: ["admin-catalog", debouncedFilter],
    queryFn: () => fetchCatalog(debouncedFilter),
  });

  const visibleIds = useMemo(() => tracks.map((t) => t.id), [tracks]);
  const selectionCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  const deleteMutation = useMutation({
    mutationFn: deleteCatalogTrack,
    onSuccess: (_data, id) => {
      toast({ message: "Track removed", variant: "success" });
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
    },
    onError: (err: Error) => toast({ message: err.message, variant: "error" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            className="pl-9"
            onChange={(event) => {
              setSearchFilter(event.target.value);
              // Filter changes can hide previously-selected rows. Drop the
              // selection so the bulk bar's count matches what's on screen.
              if (selectedIds.size > 0) setSelectedIds(new Set());
            }}
            placeholder="Filter catalog by title, artist, category, genre..."
            value={searchFilter}
          />
        </div>
        <Button
          onClick={() => {
            setIsImportOpen(true);
            setIsAddOpen(false);
          }}
          type="button"
          variant="ghost"
        >
          <ListPlus className="mr-1 h-4 w-4" /> Import playlist
        </Button>
        <Button
          onClick={() => {
            setIsAddOpen(true);
            setIsImportOpen(false);
          }}
          type="button"
        >
          <Plus className="mr-1 h-4 w-4" /> Add track
        </Button>
      </div>

      {isAddOpen ? <AddTrackPanel onClose={() => setIsAddOpen(false)} /> : null}
      {isImportOpen ? (
        <AdminCatalogImportPanel onClose={() => setIsImportOpen(false)} />
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-400/40 bg-red-950/40 p-4 text-sm text-red-200">
          {error instanceof Error ? error.message : "Failed to load catalog"}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : !tracks.length ? (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-white/60">
          No catalog tracks yet. Add one above.
        </div>
      ) : (
        <div className={`overflow-hidden rounded-xl border border-white/10 ${selectionCount > 0 ? "pb-32" : ""}`}>
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/5 text-[10px] font-bold uppercase tracking-wider text-white/60">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    aria-label={allVisibleSelected ? "Clear selection" : "Select all on this page"}
                    checked={allVisibleSelected}
                    className="h-4 w-4 cursor-pointer accent-lime-400"
                    onChange={toggleAllVisible}
                    type="checkbox"
                  />
                </th>
                <th className="px-3 py-2">Track</th>
                <th className="px-3 py-2">Artist</th>
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Genre</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <CatalogTrackRow
                  key={track.id}
                  track={track}
                  isSelected={selectedIds.has(track.id)}
                  onToggleSelected={() => toggleRow(track.id)}
                  onDelete={() => deleteMutation.mutate(track.id)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === track.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectionCount > 0 ? (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          onApplied={() => {
            clearSelection();
            queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
          }}
        />
      ) : null}
    </div>
  );
}

function CatalogTrackRow({
  track,
  isSelected,
  onToggleSelected,
  onDelete,
  isDeleting,
}: {
  track: CatalogTrack;
  isSelected: boolean;
  onToggleSelected: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => trackToDraft(track));

  const beginEditing = () => {
    setDraft(trackToDraft(track));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(trackToDraft(track));
    setIsEditing(false);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCatalogTrack(track.id, {
        title: draft.title.trim(),
        artist: draft.artist.trim(),
        album: draft.album.trim(),
        year: draft.year.trim() ? Number(draft.year) : null,
        country: draft.country.trim() || null,
        category: draft.category.trim() || null,
        genre: draft.genre.trim() || null,
      }),
    onSuccess: (updated) => {
      toast({ message: "Saved", variant: "success" });
      setDraft(trackToDraft(updated));
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
    },
    onError: (err: Error) => toast({ message: err.message, variant: "error" }),
  });

  if (!isEditing) {
    return (
      <tr className={`border-t border-white/5 hover:bg-white/5 ${isSelected ? "bg-lime-400/5" : ""}`}>
        <td className="px-3 py-2">
          <input
            aria-label={isSelected ? `Deselect ${track.title}` : `Select ${track.title}`}
            checked={isSelected}
            className="h-4 w-4 cursor-pointer accent-lime-400"
            onChange={onToggleSelected}
            type="checkbox"
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <Image
              alt=""
              className="h-10 w-10 rounded-md object-cover"
              height={40}
              src={track.cover}
              unoptimized
              width={40}
            />
            <button
              className="truncate font-semibold text-white hover:text-lime-300"
              onClick={beginEditing}
              type="button"
            >
              {track.title}
            </button>
          </div>
        </td>
        <td className="px-3 py-2 text-white/80">{track.artist}</td>
        <td className="px-3 py-2 text-white/60">{track.year ?? "—"}</td>
        <td className="px-3 py-2 text-white/60">{track.country ?? "—"}</td>
        <td className="px-3 py-2 text-white/60">{track.category ?? "—"}</td>
        <td className="px-3 py-2 text-white/60">{track.genre ?? "—"}</td>
        <td className="px-3 py-2 text-white/60">{formatDuration(track.duration)}</td>
        <td className="px-3 py-2 text-right">
          <button
            aria-label="Delete track"
            className="rounded-md border border-white/10 p-2 text-white/60 transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
            disabled={isDeleting}
            onClick={onDelete}
            type="button"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-white/5 bg-lime-400/5">
      <td className="px-3 py-2" colSpan={9}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <LabeledField label="Title">
            <Input
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              value={draft.title}
            />
          </LabeledField>
          <LabeledField label="Artist">
            <Input
              onChange={(event) => setDraft((prev) => ({ ...prev, artist: event.target.value }))}
              value={draft.artist}
            />
          </LabeledField>
          <LabeledField label="Album">
            <Input
              onChange={(event) => setDraft((prev) => ({ ...prev, album: event.target.value }))}
              value={draft.album}
            />
          </LabeledField>
          <LabeledField label="Year">
            <Input
              inputMode="numeric"
              onChange={(event) => setDraft((prev) => ({ ...prev, year: event.target.value.replace(/\D/g, "") }))}
              placeholder="2000"
              value={draft.year}
            />
          </LabeledField>
          <LabeledField label="Country">
            <Input
              onChange={(event) => setDraft((prev) => ({ ...prev, country: event.target.value }))}
              placeholder="Japan"
              value={draft.country}
            />
          </LabeledField>
          <LabeledField label="Category">
            <Input
              onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
              placeholder="Anime OST"
              value={draft.category}
            />
          </LabeledField>
          <LabeledField label="Genre">
            <Input
              onChange={(event) => setDraft((prev) => ({ ...prev, genre: event.target.value }))}
              placeholder="Rock"
              value={draft.genre}
            />
          </LabeledField>
          <div className="flex items-end gap-2">
            <Button
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              type="button"
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            <Button disabled={saveMutation.isPending} onClick={cancelEditing} type="button" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}

function trackToDraft(track: CatalogTrack): DraftState {
  return {
    base: null,
    title: track.title,
    artist: track.artist,
    album: track.album,
    year: track.year?.toString() ?? "",
    country: track.country ?? "",
    category: track.category ?? "",
    genre: track.genre ?? "",
    musicbrainzId: track.musicbrainzId,
  };
}

function AddTrackPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [enrichment, setEnrichment] = useState<EnrichmentResult | null>(null);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["admin-catalog-youtube", activeQuery],
    queryFn: () => searchYouTube(activeQuery),
    enabled: activeQuery.trim().length > 0,
  });

  const enrichMutation = useMutation({
    mutationFn: ({ title, artist }: { title: string; artist: string }) =>
      enrichMetadata(title, artist),
    onSuccess: (result) => {
      setEnrichment(result);
      setDraft((prev) => ({
        ...prev,
        year: prev.year.trim() ? prev.year : result.year ? String(result.year) : prev.year,
        country: prev.country.trim() ? prev.country : result.country ?? prev.country,
        genre: prev.genre.trim() ? prev.genre : result.genre ?? prev.genre,
        musicbrainzId: prev.musicbrainzId ?? result.musicbrainzId,
      }));
    },
    onError: (err: Error) =>
      toast({ message: `Auto-fill failed: ${err.message}`, variant: "error" }),
  });

  const selectYouTubeResult = (result: Track) => {
    setDraft({
      base: result,
      title: result.title,
      artist: result.artist,
      album: result.album,
      year: "",
      country: "",
      category: "",
      genre: "",
      musicbrainzId: null,
    });
    setEnrichment(null);
    enrichMutation.mutate({ title: result.title, artist: result.artist });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!draft.base) {
        throw new Error("Pick a YouTube video first");
      }
      return createCatalogTrack({
        title: draft.title.trim(),
        artist: draft.artist.trim(),
        album: draft.album.trim(),
        duration: draft.base.duration,
        cover: draft.base.cover,
        youtubeVideoId: draft.base.youtubeVideoId,
        year: draft.year.trim() ? Number(draft.year) : null,
        country: draft.country.trim() || null,
        category: draft.category.trim() || null,
        genre: draft.genre.trim() || null,
        musicbrainzId: draft.musicbrainzId,
      });
    },
    onSuccess: () => {
      toast({ message: "Added to catalog", variant: "success" });
      setDraft(EMPTY_DRAFT);
      setEnrichment(null);
      setSearchTerm("");
      setActiveQuery("");
      queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
    },
    onError: (err: Error) => toast({ message: err.message, variant: "error" }),
  });

  return (
    <div className="rounded-2xl border border-lime-400/30 bg-lime-400/5 p-4 shadow-lg shadow-lime-500/5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-black uppercase tracking-wider text-lime-200">
          Add catalog track
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

      <div className="mt-3 flex flex-col gap-3 lg:flex-row">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setActiveQuery(searchTerm);
                }
              }}
              placeholder="Search YouTube (song title, artist)"
              value={searchTerm}
            />
            <Button onClick={() => setActiveQuery(searchTerm)} type="button">
              Search
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-white/10 bg-black/30">
            {isFetching ? (
              <div className="flex min-h-24 items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : !activeQuery ? (
              <p className="p-4 text-xs text-white/50">Enter a song title or artist to search.</p>
            ) : !results.length ? (
              <p className="p-4 text-xs text-white/50">No YouTube results.</p>
            ) : (
              <ul>
                {results.map((result) => {
                  const selected = draft.base?.youtubeVideoId === result.youtubeVideoId;
                  return (
                    <li key={result.youtubeVideoId}>
                      <button
                        className={`flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left text-sm transition hover:bg-white/5 ${
                          selected
                            ? "border-lime-400 bg-white/5"
                            : "border-transparent"
                        }`}
                        onClick={() => selectYouTubeResult(result)}
                        type="button"
                      >
                        <Image
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                          height={40}
                          src={result.cover}
                          unoptimized
                          width={40}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-white">{result.title}</p>
                          <p className="truncate text-xs text-white/55">{result.artist}</p>
                        </div>
                        <span className="text-xs text-white/40">{formatDuration(result.duration)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {draft.base ? (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-2">
                <Image
                  alt=""
                  className="h-12 w-12 rounded object-cover"
                  height={48}
                  src={draft.base.cover}
                  unoptimized
                  width={48}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{draft.base.title}</p>
                  <p className="truncate text-xs text-white/55">YouTube: {draft.base.youtubeVideoId}</p>
                </div>
              </div>
              <EnrichmentStatus
                enrichment={enrichment}
                isPending={enrichMutation.isPending}
                onRerun={() =>
                  enrichMutation.mutate({ title: draft.title, artist: draft.artist })
                }
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <LabeledField label="Title">
                  <Input
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    value={draft.title}
                  />
                </LabeledField>
                <LabeledField label="Artist">
                  <Input
                    onChange={(event) => setDraft((prev) => ({ ...prev, artist: event.target.value }))}
                    value={draft.artist}
                  />
                </LabeledField>
                <LabeledField label="Year">
                  <Input
                    inputMode="numeric"
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, year: event.target.value.replace(/\D/g, "") }))
                    }
                    placeholder="2000"
                    value={draft.year}
                  />
                </LabeledField>
                <LabeledField label="Country">
                  <Input
                    onChange={(event) => setDraft((prev) => ({ ...prev, country: event.target.value }))}
                    placeholder="Japan"
                    value={draft.country}
                  />
                </LabeledField>
                <LabeledField label="Category">
                  <Input
                    onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="Anime OST"
                    value={draft.category}
                  />
                </LabeledField>
                <LabeledField label="Genre">
                  <Input
                    onChange={(event) => setDraft((prev) => ({ ...prev, genre: event.target.value }))}
                    placeholder="Rock"
                    value={draft.genre}
                  />
                </LabeledField>
              </div>
              <Button
                className="w-full"
                disabled={createMutation.isPending || !draft.title.trim() || !draft.artist.trim()}
                onClick={() => createMutation.mutate()}
                type="button"
              >
                {createMutation.isPending ? "Adding..." : "Add to catalog"}
              </Button>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-white/15 p-4 text-center text-xs text-white/50">
              Pick a YouTube result on the left to fill in metadata.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EnrichmentStatus({
  enrichment,
  isPending,
  onRerun,
}: {
  enrichment: EnrichmentResult | null;
  isPending: boolean;
  onRerun: () => void;
}) {
  if (isPending) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Looking up metadata...
      </div>
    );
  }

  if (!enrichment) return null;

  const anyFound = enrichment.sources.length > 0;
  const confidenceLabel =
    enrichment.confidence >= 0.8 ? "High" : enrichment.confidence >= 0.6 ? "Medium" : "Low";
  const confidenceTint =
    enrichment.confidence >= 0.8
      ? "text-lime-300 border-lime-400/40 bg-lime-400/10"
      : enrichment.confidence >= 0.6
      ? "text-amber-200 border-amber-400/40 bg-amber-400/10"
      : "text-rose-200 border-rose-400/40 bg-rose-400/10";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs">
      <Sparkles className="h-3.5 w-3.5 text-lime-300" />
      {anyFound ? (
        <>
          <span className="text-white/70">
            Auto-filled from {enrichment.sources.join(" + ")}
          </span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${confidenceTint}`}>
            {confidenceLabel} confidence
          </span>
        </>
      ) : (
        <span className="text-white/60">No metadata match found — fill in manually.</span>
      )}
      <button
        className="ml-auto rounded-md border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
        onClick={onRerun}
        type="button"
      >
        Re-run
      </button>
    </div>
  );
}

function BulkActionBar({
  selectedIds,
  onClear,
  onApplied,
}: {
  selectedIds: string[];
  onClear: () => void;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");
  const [enrich, setEnrich] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const buildPatch = (): BulkPatch => {
    const patch: BulkPatch = {};
    if (category.trim()) patch.category = category.trim();
    if (country.trim()) patch.country = country.trim();
    if (year.trim()) patch.year = Number(year);
    if (genre.trim()) patch.genre = genre.trim();
    return patch;
  };

  const hasPatch =
    category.trim().length > 0 ||
    country.trim().length > 0 ||
    year.trim().length > 0 ||
    genre.trim().length > 0;

  const isPending = progress !== null;

  const apply = async () => {
    const patch = buildPatch();
    if (!enrich && Object.keys(patch).length === 0) {
      toast({ message: "Set at least one field, or enable Re-enrich", variant: "error" });
      return;
    }

    const batchSize = enrich ? BULK_ENRICH_BATCH : BULK_PLAIN_BATCH;
    const chunks = chunk(selectedIds, batchSize);
    setProgress({ done: 0, total: selectedIds.length });

    let updatedTotal = 0;
    let errorTotal = 0;

    try {
      for (const ids of chunks) {
        const result = await bulkUpdateCatalog({ ids, patch, enrich });
        updatedTotal += result.updated;
        errorTotal += result.errors ?? 0;
        setProgress((prev) =>
          prev ? { done: prev.done + ids.length, total: prev.total } : prev,
        );
      }
      const message = errorTotal
        ? `Updated ${updatedTotal}, ${errorTotal} failed`
        : `Updated ${updatedTotal} track${updatedTotal === 1 ? "" : "s"}`;
      toast({ message, variant: errorTotal ? "error" : "success" });
      setCategory("");
      setCountry("");
      setYear("");
      setGenre("");
      setEnrich(false);
      onApplied();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk update failed";
      toast({ message, variant: "error" });
    } finally {
      setProgress(null);
    }
  };

  const pct = progress
    ? Math.min(100, Math.round((progress.done / Math.max(1, progress.total)) * 100))
    : 0;

  return (
    <div className="sticky bottom-3 z-10 mt-4 rounded-2xl border border-lime-400/40 bg-[#0a0916]/95 p-4 shadow-2xl shadow-lime-500/10 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-lime-400/40 bg-lime-400/10 px-3 py-1 text-xs font-bold text-lime-200">
          {selectedIds.length} selected
        </span>
        <button
          className="text-xs text-white/60 underline-offset-2 hover:underline"
          onClick={onClear}
          type="button"
        >
          Clear selection
        </button>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">
          Empty fields are left unchanged
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <LabeledField label="Category">
          <Input
            disabled={isPending}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Anime OST"
            value={category}
          />
        </LabeledField>
        <LabeledField label="Country">
          <Input
            disabled={isPending}
            onChange={(event) => setCountry(event.target.value)}
            placeholder="Japan"
            value={country}
          />
        </LabeledField>
        <LabeledField label="Year">
          <Input
            disabled={isPending}
            inputMode="numeric"
            onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="2000"
            value={year}
          />
        </LabeledField>
        <LabeledField label="Genre">
          <Input
            disabled={isPending}
            onChange={(event) => setGenre(event.target.value)}
            placeholder="Rock"
            value={genre}
          />
        </LabeledField>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            checked={enrich}
            className="h-4 w-4 cursor-pointer accent-lime-400"
            disabled={isPending}
            onChange={(event) => setEnrich(event.target.checked)}
            type="checkbox"
          />
          Re-enrich from MusicBrainz/Discogs
        </label>
        {enrich ? (
          <span className="text-[10px] text-amber-200/80">
            Slower — capped at {BULK_ENRICH_BATCH}/batch and rate-limited per admin
          </span>
        ) : null}
        <Button
          className="ml-auto"
          disabled={isPending || (!hasPatch && !enrich)}
          onClick={() => void apply()}
          type="button"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Applying {progress?.done}/{progress?.total}
            </>
          ) : (
            `Apply to ${selectedIds.length}`
          )}
        </Button>
      </div>

      {progress ? (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-lime-400 to-cyan-300 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
