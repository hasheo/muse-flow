"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import type { Track } from "@/lib/catalog";

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
  updatedAt: string;
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(searchFilter), 200);
    return () => clearTimeout(timer);
  }, [searchFilter]);

  const { data: tracks = [], isLoading, error } = useQuery({
    queryKey: ["admin-catalog", debouncedFilter],
    queryFn: () => fetchCatalog(debouncedFilter),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCatalogTrack,
    onSuccess: () => {
      toast({ message: "Track removed", variant: "success" });
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
            onChange={(event) => setSearchFilter(event.target.value)}
            placeholder="Filter catalog by title, artist, category, genre..."
            value={searchFilter}
          />
        </div>
        <Button onClick={() => setIsAddOpen(true)} type="button">
          <Plus className="mr-1 h-4 w-4" /> Add track
        </Button>
      </div>

      {isAddOpen ? (
        <AddTrackPanel onClose={() => setIsAddOpen(false)} />
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
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-white/5 text-[10px] font-bold uppercase tracking-wider text-white/60">
              <tr>
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
                  onDelete={() => deleteMutation.mutate(track.id)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === track.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CatalogTrackRow({
  track,
  onDelete,
  isDeleting,
}: {
  track: CatalogTrack;
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
      <tr className="border-t border-white/5 hover:bg-white/5">
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
      <td className="px-3 py-2" colSpan={8}>
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
  };
}

function AddTrackPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["admin-catalog-youtube", activeQuery],
    queryFn: () => searchYouTube(activeQuery),
    enabled: activeQuery.trim().length > 0,
  });

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
      });
    },
    onSuccess: () => {
      toast({ message: "Added to catalog", variant: "success" });
      setDraft(EMPTY_DRAFT);
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
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            base: result,
                            title: result.title,
                            artist: result.artist,
                            album: result.album,
                          }))
                        }
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
