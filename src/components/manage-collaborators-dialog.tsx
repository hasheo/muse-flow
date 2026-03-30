"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { Mail, Link as LinkIcon, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ManageCollaboratorsDialogProps = {
  open: boolean;
  playlistId: string;
  playlistName: string;
  onClose: () => void;
};

type Collaborator = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  joinedAt: string;
};

type Invite = {
  id: string;
  type: "email" | "link";
  email: string | null;
  createdAt: string;
  expiresAt: string;
};

async function fetchCollaborators(playlistId: string): Promise<Collaborator[]> {
  const response = await fetch(`/api/playlists/${playlistId}/collaborators`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    collaborators?: Collaborator[];
    message?: string;
  };
  if (!response.ok) return [];
  return payload.collaborators ?? [];
}

async function fetchInvites(playlistId: string): Promise<Invite[]> {
  const response = await fetch(`/api/playlists/${playlistId}/invites`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    invites?: Invite[];
    message?: string;
  };
  if (!response.ok) return [];
  return payload.invites ?? [];
}

export function ManageCollaboratorsDialog(props: ManageCollaboratorsDialogProps) {
  const { open, playlistId, onClose } = props;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setEmail("");
    setMessage(null);
    setLinkCopied(false);
    setGeneratedLink(null);
    onClose();
  }, [onClose]);

  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators", playlistId],
    queryFn: () => fetchCollaborators(playlistId),
    enabled: open,
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["invites", playlistId],
    queryFn: () => fetchInvites(playlistId),
    enabled: open,
  });

  const emailInviteMutation = useMutation({
    mutationFn: async (inviteEmail: string) => {
      const response = await fetch(`/api/playlists/${playlistId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", email: inviteEmail }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "Failed to send invite");
      }
      return payload;
    },
    onSuccess: () => {
      setEmail("");
      setMessage({ type: "success", text: "Invite sent successfully!" });
      queryClient.invalidateQueries({ queryKey: ["invites", playlistId] });
    },
    onError: (err: Error) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const linkInviteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/playlists/${playlistId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "link" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "Failed to generate link");
      }
      return payload as { inviteUrl: string };
    },
    onSuccess: async (data) => {
      const fullUrl = window.location.origin + data.inviteUrl;
      setGeneratedLink(fullUrl);
      try {
        await navigator.clipboard.writeText(fullUrl);
        setLinkCopied(true);
        setMessage({ type: "success", text: "Invite link copied to clipboard!" });
        setTimeout(() => setLinkCopied(false), 3000);
      } catch {
        setMessage({ type: "success", text: "Invite link generated! Copy it below." });
      }
      queryClient.invalidateQueries({ queryKey: ["invites", playlistId] });
    },
    onError: (err: Error) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      emailInputRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
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
  }, [handleClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
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
            Manage Collaborators
          </p>
          <button
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            onClick={handleClose}
            type="button"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Success/Error message */}
          {message ? (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                message.type === "success"
                  ? "bg-lime-400/10 text-lime-300"
                  : "bg-red-400/10 text-red-300"
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {/* Invite by Email */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
              Invite by Email
            </p>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (email.trim()) {
                  emailInviteMutation.mutate(email.trim());
                }
              }}
            >
              <Input
                ref={emailInputRef}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="collaborator@example.com"
                type="email"
                value={email}
              />
              <Button
                disabled={!email.trim() || emailInviteMutation.isPending}
                type="submit"
              >
                {emailInviteMutation.isPending ? "Sending..." : "Invite"}
              </Button>
            </form>
          </div>

          {/* Invite by Link */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
              Invite by Link
            </p>
            <Button
              disabled={linkInviteMutation.isPending}
              onClick={() => linkInviteMutation.mutate()}
              type="button"
              variant="ghost"
            >
              {linkCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Generate Single-Use Link
                </>
              )}
            </Button>
            {generatedLink && !linkCopied ? (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  className="flex-1 text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  readOnly
                  value={generatedLink}
                />
                <Button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(generatedLink);
                      setLinkCopied(true);
                      setMessage({ type: "success", text: "Invite link copied to clipboard!" });
                      setTimeout(() => setLinkCopied(false), 3000);
                    } catch {
                      // Input select fallback is already available
                    }
                  }}
                  type="button"
                  variant="ghost"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>

          {/* Collaborators */}
          {collaborators.length > 0 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
                Collaborators ({collaborators.length})
              </p>
              <div className="space-y-2">
                {collaborators.map((collab) => (
                  <div
                    className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5"
                    key={collab.id}
                  >
                    {collab.image ? (
                      <Image
                        alt={collab.name || collab.email}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                        height={32}
                        src={collab.image}
                        unoptimized
                        width={32}
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium text-white">
                        {(collab.name || collab.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {collab.name || collab.email}
                      </p>
                      <p className="truncate text-xs text-white/50">
                        {collab.email} · Joined{" "}
                        {new Date(collab.joinedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Pending Invites */}
          {invites.length > 0 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
                Pending Invites ({invites.length})
              </p>
              <div className="space-y-2">
                {invites.map((invite) => (
                  <div
                    className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5"
                    key={invite.id}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/50">
                      {invite.type === "email" ? (
                        <Mail className="h-4 w-4" />
                      ) : (
                        <LinkIcon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {invite.type === "email"
                          ? invite.email
                          : "Link invite"}
                      </p>
                      <p className="truncate text-xs text-white/50">
                        Created{" "}
                        {new Date(invite.createdAt).toLocaleDateString()} ·
                        Expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-3">
          <div className="flex justify-end">
            <Button onClick={handleClose} type="button">
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
