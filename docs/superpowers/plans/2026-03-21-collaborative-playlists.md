# Collaborative Playlists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow playlist owners to invite collaborators (by email or link) who can add/remove their own songs.

**Architecture:** Two new Prisma models (`PlaylistCollaborator`, `PlaylistInvite`) plus an `addedById` field on `PlaylistTrack`. New API routes for invite CRUD and acceptance. Modified existing routes for collaborative access control. New UI components for collaborator management, invite acceptance, and track attribution.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + PostgreSQL, NextAuth v4, Zod, TanStack React Query, Tailwind CSS, Radix UI

---

### Task 1: Prisma Schema — New Models and Modified Fields

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `InviteType` enum and `PlaylistCollaborator` model**

In `prisma/schema.prisma`, add after the `PlaylistTrack` model:

```prisma
enum InviteType {
  email
  link
}

model PlaylistCollaborator {
  id         String   @id @default(cuid())
  playlistId String
  userId     String
  joinedAt   DateTime @default(now())
  playlist   Playlist @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([playlistId, userId])
  @@index([userId])
}
```

- [ ] **Step 2: Add `PlaylistInvite` model**

After `PlaylistCollaborator`:

```prisma
model PlaylistInvite {
  id         String      @id @default(cuid())
  playlistId String
  type       InviteType
  email      String?
  token      String      @unique @default(cuid())
  used       Boolean     @default(false)
  usedById   String?
  createdAt  DateTime    @default(now())
  expiresAt  DateTime?
  playlist   Playlist    @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  usedBy     User?       @relation("UsedInvites", fields: [usedById], references: [id], onDelete: SetNull)

  @@index([email, type, used])
}
```

- [ ] **Step 3: Add `addedById` to `PlaylistTrack`**

In the `PlaylistTrack` model, add:

```prisma
  addedById      String?
  addedBy        User?    @relation("AddedTracks", fields: [addedById], references: [id], onDelete: SetNull)
```

- [ ] **Step 4: Add relation fields to `Playlist` model**

In the `Playlist` model, add after `quizAttempts`:

```prisma
  collaborators PlaylistCollaborator[]
  invites       PlaylistInvite[]
```

- [ ] **Step 5: Add relation fields to `User` model**

In the `User` model, add after `quizAttempts`:

```prisma
  collaborations PlaylistCollaborator[]
  usedInvites    PlaylistInvite[]       @relation("UsedInvites")
  addedTracks    PlaylistTrack[]        @relation("AddedTracks")
```

- [ ] **Step 6: Generate migration and apply**

```bash
npx prisma migrate dev --name add-collaborative-playlists
```

Expected: Migration creates `PlaylistCollaborator` table, `PlaylistInvite` table, adds `addedById` column to `PlaylistTrack`, creates indexes and constraints.

- [ ] **Step 7: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 8: Commit**

```bash
git add prisma/
git commit -m "feat: add collaborative playlists schema — PlaylistCollaborator, PlaylistInvite, addedById

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Authorization Helper — `getPlaylistWithRole`

**Files:**
- Create: `src/lib/playlist-auth.ts`

- [ ] **Step 1: Create the authorization helper**

Create `src/lib/playlist-auth.ts`:

```typescript
import { db } from "@/lib/db";

export type PlaylistRole = "owner" | "collaborator" | null;

export type PlaylistWithRole = {
  playlist: {
    id: string;
    name: string;
    cover: string;
    isQuiz: boolean;
    isPublic: boolean;
    difficulty: string;
    answerMode: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  };
  role: PlaylistRole;
};

export async function getPlaylistWithRole(
  playlistId: string,
  userId: string,
): Promise<PlaylistWithRole | null> {
  const playlist = await db.playlist.findFirst({
    where: { id: playlistId },
  });

  if (!playlist) return null;

  if (playlist.userId === userId) {
    return { playlist, role: "owner" };
  }

  const collaborator = await db.playlistCollaborator.findUnique({
    where: {
      playlistId_userId: { playlistId, userId },
    },
  });

  if (collaborator) {
    return { playlist, role: "collaborator" };
  }

  return { playlist, role: null };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/playlist-auth.ts
git commit -m "feat: add getPlaylistWithRole authorization helper

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: API — Create and List Invites

**Files:**
- Create: `src/app/api/playlists/[id]/invites/route.ts`

- [ ] **Step 1: Implement POST and GET for playlist invites**

Create `src/app/api/playlists/[id]/invites/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { enforcePlaylistWriteRateLimit } from "@/lib/api-security";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";

const paramsSchema = z.object({ id: z.string().cuid() });

const createInviteSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("email"), email: z.string().email() }),
    z.object({ type: z.literal("link") }),
  ]);

const MAX_PENDING_INVITES = 50;
const LINK_INVITE_EXPIRY_DAYS = 7;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid playlist id",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const { id: playlistId } = parsedParams.data;

    const playlist = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "create-invite");
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError({ status: 400, code: "INVALID_JSON", message: "Invalid JSON body" });
    }

    const parsed = createInviteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid invite payload",
        details: zodErrorDetails(parsed.error),
      });
    }

    const pendingCount = await db.playlistInvite.count({
      where: { playlistId, used: false },
    });
    if (pendingCount >= MAX_PENDING_INVITES) {
      return apiError({
        status: 422,
        code: "INVITE_LIMIT_REACHED",
        message: `Maximum of ${MAX_PENDING_INVITES} pending invites per playlist`,
      });
    }

    const inviteData = parsed.data;

    if (inviteData.type === "email") {
      const normalizedEmail = inviteData.email.toLowerCase();

      if (normalizedEmail === session.user.email?.toLowerCase()) {
        return apiError({
          status: 400,
          code: "CANNOT_INVITE_SELF",
          message: "You cannot invite yourself",
        });
      }

      const existingCollaborator = await db.user.findFirst({
        where: { email: normalizedEmail },
      });

      if (existingCollaborator) {
        const alreadyCollaborator = await db.playlistCollaborator.findUnique({
          where: {
            playlistId_userId: { playlistId, userId: existingCollaborator.id },
          },
        });
        if (alreadyCollaborator) {
          return apiError({
            status: 400,
            code: "ALREADY_COLLABORATOR",
            message: "This user is already a collaborator",
          });
        }
      }

      const existingInvite = await db.playlistInvite.findFirst({
        where: {
          playlistId,
          type: "email",
          email: normalizedEmail,
          used: false,
        },
      });
      if (existingInvite) {
        return apiError({
          status: 400,
          code: "DUPLICATE_INVITE",
          message: "An invite for this email is already pending",
        });
      }

      const invite = await db.playlistInvite.create({
        data: {
          playlistId,
          type: "email",
          email: normalizedEmail,
        },
      });

      return NextResponse.json(
        {
          invite: {
            id: invite.id,
            type: invite.type,
            email: invite.email,
            createdAt: invite.createdAt,
            used: invite.used,
          },
        },
        { status: 201 },
      );
    }

    // Link invite
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + LINK_INVITE_EXPIRY_DAYS);

    const invite = await db.playlistInvite.create({
      data: {
        playlistId,
        type: "link",
        expiresAt,
      },
    });

    return NextResponse.json(
      {
        invite: {
          id: invite.id,
          type: invite.type,
          token: invite.token,
          inviteUrl: `/invite/${invite.token}`,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
          used: invite.used,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create invite",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid playlist id",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const { id: playlistId } = parsedParams.data;

    const playlist = await db.playlist.findFirst({
      where: { id: playlistId, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const invites = await db.playlistInvite.findMany({
      where: { playlistId, used: false },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      invites: invites.map((invite) => ({
        id: invite.id,
        type: invite.type,
        email: invite.type === "email" ? invite.email : undefined,
        token: invite.type === "link" ? invite.token : undefined,
        inviteUrl: invite.type === "link" ? `/invite/${invite.token}` : undefined,
        used: invite.used,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      })),
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch invites",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/playlists/[id]/invites/route.ts
git commit -m "feat: add API for creating and listing playlist invites

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: API — Accept Invite

**Files:**
- Create: `src/app/api/playlists/invite/[token]/route.ts`

- [ ] **Step 1: Implement invite acceptance endpoint**

Create `src/app/api/playlists/invite/[token]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const paramsSchema = z.object({ token: z.string().min(1) });

const MAX_COLLABORATORS = 20;

const inviteAcceptRateLimit = {
  windowMs: 60_000,
  maxRequests: 10,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid invite token",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const ip = getClientIp(request.headers);
    const rateLimit = await checkRateLimit(
      `invite-accept:${session.user.id}:${ip}`,
      inviteAcceptRateLimit,
    );
    if (!rateLimit.allowed) {
      return apiError({
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
        headers: {
          "Retry-After": Math.ceil(rateLimit.retryAfterMs / 1000).toString(),
        },
      });
    }

    const { token } = parsedParams.data;

    const invite = await db.playlistInvite.findUnique({
      where: { token },
      include: {
        playlist: {
          select: { id: true, name: true, cover: true, userId: true },
        },
      },
    });

    if (!invite || invite.used) {
      return apiError({
        status: 404,
        code: "INVITE_NOT_FOUND",
        message: "Invite not found or already used",
      });
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return apiError({
        status: 410,
        code: "INVITE_EXPIRED",
        message: "This invite has expired",
      });
    }

    if (invite.playlist.userId === session.user.id) {
      return apiError({
        status: 400,
        code: "CANNOT_JOIN_OWN_PLAYLIST",
        message: "You are the owner of this playlist",
      });
    }

    if (invite.type === "email") {
      if (invite.email?.toLowerCase() !== session.user.email?.toLowerCase()) {
        return apiError({
          status: 403,
          code: "EMAIL_MISMATCH",
          message: "This invite was sent to a different email address",
        });
      }
    }

    const existingCollaborator = await db.playlistCollaborator.findUnique({
      where: {
        playlistId_userId: {
          playlistId: invite.playlistId,
          userId: session.user.id,
        },
      },
    });

    if (existingCollaborator) {
      return apiError({
        status: 400,
        code: "ALREADY_COLLABORATOR",
        message: "You are already a collaborator on this playlist",
      });
    }

    // Use interactive transaction to atomically check count + create
    await db.$transaction(async (tx) => {
      const collaboratorCount = await tx.playlistCollaborator.count({
        where: { playlistId: invite.playlistId },
      });

      if (collaboratorCount >= MAX_COLLABORATORS) {
        throw new Error("COLLABORATOR_LIMIT_REACHED");
      }

      await tx.playlistCollaborator.create({
        data: {
          playlistId: invite.playlistId,
          userId: session.user.id,
        },
      });

      await tx.playlistInvite.update({
        where: { id: invite.id },
        data: {
          used: true,
          usedById: session.user.id,
        },
      });
    });

    return NextResponse.json({
      playlist: {
        id: invite.playlist.id,
        name: invite.playlist.name,
        cover: invite.playlist.cover,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "COLLABORATOR_LIMIT_REACHED") {
      return apiError({
        status: 422,
        code: "COLLABORATOR_LIMIT_REACHED",
        message: `This playlist has reached the maximum of ${MAX_COLLABORATORS} collaborators`,
      });
    }
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to accept invite",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid invite token",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const { token } = parsedParams.data;

    const invite = await db.playlistInvite.findUnique({
      where: { token },
      include: {
        playlist: {
          select: {
            id: true,
            name: true,
            cover: true,
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!invite) {
      return apiError({
        status: 404,
        code: "INVITE_NOT_FOUND",
        message: "Invite not found",
      });
    }

    const expired = invite.expiresAt ? invite.expiresAt < new Date() : false;

    return NextResponse.json({
      invite: {
        used: invite.used,
        expired,
        type: invite.type,
        playlist: {
          id: invite.playlist.id,
          name: invite.playlist.name,
          cover: invite.playlist.cover,
          ownerName:
            invite.playlist.user.name?.trim() ||
            invite.playlist.user.email?.split("@")[0] ||
            "Unknown",
        },
      },
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch invite details",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/playlists/invite/
git commit -m "feat: add API for accepting invites and fetching invite details

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: API — Pending Invites and Decline Invite

**Files:**
- Create: `src/app/api/invites/pending/route.ts`
- Create: `src/app/api/invites/[token]/route.ts`

- [ ] **Step 1: Implement pending invites endpoint**

Create `src/app/api/invites/pending/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getUserDisplayName } from "@/lib/user-display";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const invites = await db.playlistInvite.findMany({
      where: {
        type: "email",
        email: session.user.email.toLowerCase(),
        used: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        playlist: {
          select: {
            id: true,
            name: true,
            cover: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      invites: invites.map((invite) => ({
        id: invite.id,
        token: invite.token,
        createdAt: invite.createdAt,
        playlist: {
          id: invite.playlist.id,
          name: invite.playlist.name,
          cover: invite.playlist.cover,
          ownerName: getUserDisplayName(
            invite.playlist.user.name,
            invite.playlist.user.email,
          ),
        },
      })),
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch pending invites",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
```

- [ ] **Step 2: Implement decline invite endpoint**

Create `src/app/api/invites/[token]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";

const paramsSchema = z.object({ token: z.string().min(1) });

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid invite token",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const { token } = parsedParams.data;

    const invite = await db.playlistInvite.findUnique({
      where: { token },
    });

    if (!invite || invite.used) {
      return apiError({
        status: 404,
        code: "INVITE_NOT_FOUND",
        message: "Invite not found or already used",
      });
    }

    if (
      invite.type === "email" &&
      invite.email?.toLowerCase() !== session.user.email?.toLowerCase()
    ) {
      return apiError({
        status: 403,
        code: "EMAIL_MISMATCH",
        message: "This invite was sent to a different email address",
      });
    }

    await db.playlistInvite.update({
      where: { id: invite.id },
      data: { used: true },
    });

    return NextResponse.json({ message: "Invite declined" });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to decline invite",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/invites/
git commit -m "feat: add pending invites and decline invite API endpoints

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: API — List Collaborators

**Files:**
- Create: `src/app/api/playlists/[id]/collaborators/route.ts`

- [ ] **Step 1: Implement collaborators list endpoint**

Create `src/app/api/playlists/[id]/collaborators/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getPlaylistWithRole } from "@/lib/playlist-auth";

const paramsSchema = z.object({ id: z.string().cuid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid playlist id",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const { id: playlistId } = parsedParams.data;
    const result = await getPlaylistWithRole(playlistId, session.user.id);

    if (!result || !result.role) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const collaborators = await db.playlistCollaborator.findMany({
      where: { playlistId },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({
      collaborators: collaborators.map((c) => ({
        id: c.id,
        userId: c.user.id,
        name: c.user.name,
        email: c.user.email,
        image: c.user.image,
        joinedAt: c.joinedAt,
      })),
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch collaborators",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/playlists/[id]/collaborators/
git commit -m "feat: add API for listing playlist collaborators

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Modify Existing API — GET /api/playlists (List With Collaborations)

**Files:**
- Modify: `src/app/api/playlists/route.ts`

- [ ] **Step 1: Update GET handler to include collaborative playlists**

In `src/app/api/playlists/route.ts`, replace the `GET` function:

```typescript
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    }

    const [ownedPlaylists, collaborations] = await Promise.all([
      db.playlist.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { tracks: true } },
        },
      }),
      db.playlistCollaborator.findMany({
        where: { userId: session.user.id },
        include: {
          playlist: {
            include: {
              _count: { select: { tracks: true } },
              user: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { playlist: { updatedAt: "desc" } },
      }),
    ]);

    return NextResponse.json({
      playlists: [
        ...ownedPlaylists.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          cover: playlist.cover,
          isQuiz: playlist.isQuiz,
          isPublic: playlist.isPublic,
          difficulty: playlist.difficulty,
          answerMode: playlist.answerMode,
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
          trackCount: playlist._count.tracks,
          role: "owner" as const,
        })),
        ...collaborations.map((c) => ({
          id: c.playlist.id,
          name: c.playlist.name,
          cover: c.playlist.cover,
          isQuiz: c.playlist.isQuiz,
          isPublic: c.playlist.isPublic,
          difficulty: c.playlist.difficulty,
          answerMode: c.playlist.answerMode,
          createdAt: c.playlist.createdAt,
          updatedAt: c.playlist.updatedAt,
          trackCount: c.playlist._count.tracks,
          role: "collaborator" as const,
          ownerName:
            c.playlist.user.name?.trim() ||
            c.playlist.user.email?.split("@")[0] ||
            "Unknown",
        })),
      ],
    });
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch playlists",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/playlists/route.ts
git commit -m "feat: include collaborative playlists in GET /api/playlists

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Modify Existing API — GET /api/playlists/[id] (Add Role and Track Attribution)

**Files:**
- Modify: `src/app/api/playlists/[id]/route.ts`

- [ ] **Step 1: Update GET to support collaborators and track attribution**

In `src/app/api/playlists/[id]/route.ts`, update the `GET` function.

Replace the playlist query to include `addedBy`:

```typescript
// Replace the existing select inside tracks with:
    const playlist = await db.playlist.findFirst({
      where: { id },
      include: {
        tracks: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: {
            trackId: true,
            sourceType: true,
            title: true,
            artist: true,
            album: true,
            duration: true,
            cover: true,
            youtubeVideoId: true,
            addedById: true,
            addedBy: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });
```

Replace the access control check (the `isOwner` block) with:

```typescript
    const isOwner = playlist.userId === session.user.id;
    let role: "owner" | "collaborator" | null = isOwner ? "owner" : null;

    if (!isOwner) {
      const collaborator = await db.playlistCollaborator.findUnique({
        where: {
          playlistId_userId: { playlistId: id, userId: session.user.id },
        },
      });
      if (collaborator) {
        role = "collaborator";
      }
    }

    if (!role && !(playlist.isQuiz && playlist.isPublic)) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }
```

Update `mapPlaylistTrackToTrack` to accept and pass through `addedBy`:

Update the function signature and return type to include `addedBy`:

```typescript
function mapPlaylistTrackToTrack(track: {
  trackId: string;
  sourceType: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  youtubeVideoId: string | null;
  addedBy?: { id: string; name: string | null; image: string | null } | null;
}): (Track & { addedBy?: { id: string; name: string | null; image: string | null } | null }) | null {
```

And in the return statement, add `addedBy: track.addedBy`:

```typescript
    return {
      id: track.trackId,
      sourceType: "youtube",
      youtubeVideoId: track.youtubeVideoId,
      title: cleaned.title,
      artist: cleaned.artist,
      album: cleaned.album,
      duration: track.duration,
      cover: track.cover,
      addedBy: track.addedBy,
    };
```

Add `role` to the response JSON:

```typescript
      playlist: {
        id: playlist.id,
        name: playlist.name,
        cover: playlist.cover,
        isQuiz: playlist.isQuiz,
        isPublic: playlist.isPublic,
        difficulty: playlist.difficulty,
        answerMode: playlist.answerMode,
        ownerName: getUserDisplayName(owner?.name, owner?.email),
        trackCount: tracks.length,
        role: role || "viewer",
      },
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/playlists/[id]/route.ts
git commit -m "feat: add role and track attribution to GET /api/playlists/[id]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Modify Existing API — POST and DELETE Tracks (Collaborator Access)

**Files:**
- Modify: `src/app/api/playlists/[id]/tracks/route.ts`

- [ ] **Step 1: Update POST (add track) to allow collaborators and set addedById**

In the `POST` function, replace the playlist lookup:

```typescript
    // Old: where: { id: playlistId, userId: session.user.id }
    // New: use getPlaylistWithRole
    const result = await getPlaylistWithRole(playlistId, session.user.id);

    if (!result || !result.role) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }
```

Add import at top:

```typescript
import { getPlaylistWithRole } from "@/lib/playlist-auth";
```

In the upsert, add `addedById` only in `create`:

```typescript
      create: {
        playlistId,
        trackId: track.id,
        position: nextPosition,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        cover: track.cover,
        sourceType: "youtube",
        youtubeVideoId: track.youtubeVideoId,
        mimeType: null,
        sourcePath: null,
        addedById: session.user.id,
      },
```

The `update` branch stays unchanged (no `addedById` update).

- [ ] **Step 2: Update DELETE (remove track) to allow collaborators with own-track restriction**

In the `DELETE` function, replace the playlist lookup:

```typescript
    const result = await getPlaylistWithRole(playlistId, session.user.id);

    if (!result || !result.role) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }
```

After parsing `trackId`, before the `deleteMany`, add collaborator check:

```typescript
    if (result.role === "collaborator") {
      const track = await db.playlistTrack.findFirst({
        where: { playlistId, trackId },
        select: { addedById: true },
      });

      if (!track) {
        return apiError({ status: 404, code: "NOT_FOUND", message: "Track not found" });
      }

      if (track.addedById !== session.user.id) {
        return apiError({
          status: 403,
          code: "FORBIDDEN",
          message: "You can only remove tracks you added",
        });
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/playlists/[id]/tracks/route.ts
git commit -m "feat: allow collaborators to add/remove tracks with access control

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9.5: Modify Clone Route — Set `addedById` on Cloned Tracks

**Files:**
- Modify: `src/app/api/playlists/[id]/clone/route.ts`

- [ ] **Step 1: Add `addedById` to cloned track creation**

In the `tracks.create` map inside `db.playlist.create`, add `addedById: session.user.id` to each track object:

```typescript
        tracks: {
          create: cloneableTracks.map((track, index) => ({
            trackId: track.trackId,
            position: index,
            sourceType: "youtube",
            title: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
            cover: track.cover,
            youtubeVideoId: track.youtubeVideoId,
            mimeType: null,
            sourcePath: null,
            addedById: session.user.id,
          })),
        },
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/playlists/[id]/clone/route.ts
git commit -m "feat: set addedById on cloned tracks

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Update `PlaylistSummary` Type and `fetchPlaylists`

**Files:**
- Modify: `src/lib/playlist.ts`

- [ ] **Step 1: Add role and ownerName to PlaylistSummary**

Update `src/lib/playlist.ts`:

```typescript
export const DEFAULT_PLAYLIST_COVER =
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=80";

export type PlaylistSummary = {
  id: string;
  name: string;
  cover: string;
  trackCount: number;
  role?: "owner" | "collaborator";
  ownerName?: string;
};

export async function fetchPlaylists(): Promise<PlaylistSummary[]> {
  const response = await fetch("/api/playlists", { cache: "no-store" });
  const payload = (await response.json()) as { playlists?: PlaylistSummary[]; message?: string };

  if (!response.ok) {
    throw new Error(payload.message || "Failed to fetch playlists");
  }

  return payload.playlists ?? [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/playlist.ts
git commit -m "feat: add role and ownerName to PlaylistSummary type

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: UI — Update Library View With Collaborative Playlists and Pending Invites

**Files:**
- Modify: `src/components/library-view.tsx`

- [ ] **Step 1: Update LibraryView to show collaborative playlists and pending invites**

Rewrite `src/components/library-view.tsx`:

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { fetchPlaylists } from "@/lib/playlist";
import type { PlaylistSummary } from "@/lib/playlist";

type PendingInvite = {
  id: string;
  token: string;
  createdAt: string;
  playlist: {
    id: string;
    name: string;
    cover: string;
    ownerName: string;
  };
};

async function fetchPendingInvites(): Promise<PendingInvite[]> {
  const response = await fetch("/api/invites/pending", { cache: "no-store" });
  const payload = (await response.json()) as { invites?: PendingInvite[]; message?: string };
  if (!response.ok) return [];
  return payload.invites ?? [];
}

function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <Link
      className="group overflow-hidden rounded-2xl border border-white/10 bg-black/35 transition hover:border-lime-300/50"
      href={`/library/${playlist.id}`}
    >
      <Image
        alt={playlist.name}
        className="h-44 w-full object-cover transition duration-300 group-hover:scale-105"
        height={176}
        src={playlist.cover}
        unoptimized
        width={420}
      />
      <div className="p-4">
        <p className="truncate font-semibold text-white">{playlist.name}</p>
        <div className="flex items-center gap-2 text-sm text-white/65">
          <span>{playlist.trackCount} tracks</span>
          {playlist.role === "collaborator" && (
            <>
              <span>&middot;</span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {playlist.ownerName}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export function LibraryView() {
  const queryClient = useQueryClient();

  const {
    data: playlists = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["pending-invites"],
    queryFn: fetchPendingInvites,
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/playlists/invite/${token}`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Failed to accept invite");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["pending-invites"] }),
      ]);
    },
  });

  const declineInviteMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(`/api/invites/${token}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Failed to decline invite");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
    },
  });

  if (isLoading) {
    return <p className="text-sm text-white/70">Loading your playlists...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-300">
        {error instanceof Error ? error.message : "Failed to load playlists"}
      </p>
    );
  }

  const ownedPlaylists = playlists.filter((p) => p.role !== "collaborator");
  const collaborativePlaylists = playlists.filter((p) => p.role === "collaborator");

  const isEmpty = !ownedPlaylists.length && !collaborativePlaylists.length && !pendingInvites.length;

  if (isEmpty) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
        <p className="text-lg font-semibold">Your Library is empty</p>
        <p className="mt-2 text-sm text-white/65">
          Create a playlist on the Home page, then save your favorite tracks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-white">Pending Invites</h3>
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <div
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/35 p-4"
                key={invite.id}
              >
                <Image
                  alt={invite.playlist.name}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  height={48}
                  src={invite.playlist.cover}
                  unoptimized
                  width={48}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{invite.playlist.name}</p>
                  <p className="text-sm text-white/50">
                    Invited by {invite.playlist.ownerName}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    disabled={acceptInviteMutation.isPending || declineInviteMutation.isPending}
                    onClick={() => acceptInviteMutation.mutate(invite.token)}
                    type="button"
                  >
                    Accept
                  </Button>
                  <Button
                    disabled={acceptInviteMutation.isPending || declineInviteMutation.isPending}
                    onClick={() => declineInviteMutation.mutate(invite.token)}
                    type="button"
                    variant="ghost"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Playlists */}
      {ownedPlaylists.length > 0 && (
        <div>
          {collaborativePlaylists.length > 0 && (
            <h3 className="mb-4 text-lg font-semibold text-white">My Playlists</h3>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ownedPlaylists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        </div>
      )}

      {/* Collaborative Playlists */}
      {collaborativePlaylists.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-white">Collaborative Playlists</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collaborativePlaylists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/library-view.tsx
git commit -m "feat: show collaborative playlists and pending invites in library view

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: UI — Manage Collaborators Dialog

**Files:**
- Create: `src/components/manage-collaborators-dialog.tsx`

- [ ] **Step 1: Create the ManageCollaboratorsDialog component**

Create `src/components/manage-collaborators-dialog.tsx`:

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link as LinkIcon, Mail, Users } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Collaborator = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  joinedAt: string;
};

type Invite = {
  id: string;
  type: "email" | "link";
  email?: string;
  token?: string;
  inviteUrl?: string;
  used: boolean;
  expiresAt: string | null;
  createdAt: string;
};

type ManageCollaboratorsDialogProps = {
  open: boolean;
  playlistId: string;
  playlistName: string;
  onClose: () => void;
};

export function ManageCollaboratorsDialog({
  open,
  playlistId,
  playlistName,
  onClose,
}: ManageCollaboratorsDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: collaborators = [] } = useQuery<Collaborator[]>({
    queryKey: ["collaborators", playlistId],
    queryFn: async () => {
      const res = await fetch(`/api/playlists/${playlistId}/collaborators`);
      const payload = (await res.json()) as { collaborators?: Collaborator[] };
      return payload.collaborators ?? [];
    },
    enabled: open,
  });

  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ["invites", playlistId],
    queryFn: async () => {
      const res = await fetch(`/api/playlists/${playlistId}/invites`);
      const payload = (await res.json()) as { invites?: Invite[] };
      return payload.invites ?? [];
    },
    enabled: open,
  });

  const inviteByEmailMutation = useMutation({
    mutationFn: async (emailToInvite: string) => {
      const res = await fetch(`/api/playlists/${playlistId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", email: emailToInvite }),
      });
      const payload = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(payload.message || "Failed to send invite");
    },
    onSuccess: async () => {
      setError(null);
      setSuccess("Email invite sent!");
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["invites", playlistId] });
    },
    onError: (e) => {
      setSuccess(null);
      setError(e instanceof Error ? e.message : "Failed to send invite");
    },
  });

  const inviteByLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/playlists/${playlistId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "link" }),
      });
      const payload = (await res.json()) as {
        invite?: { token: string; inviteUrl: string };
        message?: string;
      };
      if (!res.ok) throw new Error(payload.message || "Failed to generate link");
      return payload.invite;
    },
    onSuccess: async (invite) => {
      setError(null);
      if (invite?.inviteUrl) {
        const fullUrl = `${window.location.origin}${invite.inviteUrl}`;
        await navigator.clipboard.writeText(fullUrl);
        setCopiedToken(invite.token);
        setSuccess("Invite link copied to clipboard!");
        setTimeout(() => setCopiedToken(null), 3000);
      }
      await queryClient.invalidateQueries({ queryKey: ["invites", playlistId] });
    },
    onError: (e) => {
      setSuccess(null);
      setError(e instanceof Error ? e.message : "Failed to generate link");
    },
  });

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setError(null);
      setSuccess(null);
      setCopiedToken(null);
    }
  }, [open]);

  if (!open) return null;

  const pendingInvites = invites.filter((i) => !i.used);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          <div>
            <p className="text-lg font-semibold text-white" id={titleId}>
              Manage Collaborators
            </p>
            <p className="text-sm text-white/50">{playlistName}</p>
          </div>
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

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Status messages */}
          {success && <p className="text-sm text-lime-300">{success}</p>}
          {error && <p className="text-sm text-red-300">{error}</p>}

          {/* Invite by Email */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
              <Mail className="h-3.5 w-3.5" /> Invite by Email
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) {
                  inviteByEmailMutation.mutate(email.trim());
                }
              }}
            >
              <Input
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                type="email"
                value={email}
              />
              <Button
                disabled={!email.trim() || inviteByEmailMutation.isPending}
                type="submit"
              >
                {inviteByEmailMutation.isPending ? "Inviting..." : "Invite"}
              </Button>
            </form>
          </div>

          {/* Invite by Link */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
              <LinkIcon className="h-3.5 w-3.5" /> Invite by Link
            </p>
            <Button
              disabled={inviteByLinkMutation.isPending}
              onClick={() => inviteByLinkMutation.mutate()}
              type="button"
              variant="ghost"
            >
              {inviteByLinkMutation.isPending ? (
                "Generating..."
              ) : copiedToken ? (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" /> Copied!
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Copy className="h-4 w-4" /> Generate Single-Use Link
                </span>
              )}
            </Button>
          </div>

          {/* Current Collaborators */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
              <Users className="h-3.5 w-3.5" /> Collaborators ({collaborators.length})
            </p>
            {collaborators.length > 0 ? (
              <div className="space-y-2">
                {collaborators.map((c) => (
                  <div
                    className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5"
                    key={c.id}
                  >
                    {c.image ? (
                      <Image
                        alt={c.name || ""}
                        className="h-8 w-8 rounded-full object-cover"
                        height={32}
                        src={c.image}
                        unoptimized
                        width={32}
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/70">
                        {(c.name || c.email || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {c.name || c.email || "Unknown"}
                      </p>
                      {c.email && c.name && (
                        <p className="truncate text-xs text-white/50">{c.email}</p>
                      )}
                    </div>
                    <p className="shrink-0 text-xs text-white/30">
                      Joined {new Date(c.joinedAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/50">No collaborators yet.</p>
            )}
          </div>

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/50">
                Pending Invites ({pendingInvites.length})
              </p>
              <div className="space-y-2">
                {pendingInvites.map((invite) => (
                  <div
                    className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5"
                    key={invite.id}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5">
                      {invite.type === "email" ? (
                        <Mail className="h-4 w-4 text-white/40" />
                      ) : (
                        <LinkIcon className="h-4 w-4 text-white/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/70">
                        {invite.type === "email" ? invite.email : "Link invite"}
                      </p>
                      <p className="text-xs text-white/30">
                        Created {new Date(invite.createdAt).toLocaleDateString()}
                        {invite.expiresAt && (
                          <> &middot; Expires {new Date(invite.expiresAt).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-5 py-3">
          <div className="flex justify-end">
            <Button onClick={onClose} type="button">Done</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/manage-collaborators-dialog.tsx
git commit -m "feat: add ManageCollaboratorsDialog component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 13: UI — Update Playlist Detail View

**Files:**
- Modify: `src/components/playlist-detail-view.tsx`

- [ ] **Step 1: Update types and fetch response to include role and addedBy**

Update the types at the top of `playlist-detail-view.tsx`:

```typescript
type TrackWithAttribution = Track & {
  addedBy?: { id: string; name: string | null; image: string | null } | null;
};

type PlaylistDetail = {
  id: string;
  name: string;
  cover: string;
  trackCount: number;
  role?: "owner" | "collaborator" | "viewer";
};

type PlaylistDetailResponse = {
  playlist?: PlaylistDetail;
  tracks?: TrackWithAttribution[];
  message?: string;
};
```

- [ ] **Step 2: Add imports and collaborator dialog state**

Add imports:

```typescript
import { Users } from "lucide-react";
import { ManageCollaboratorsDialog } from "@/components/manage-collaborators-dialog";
```

Add state in the component:

```typescript
const [isCollabDialogOpen, setIsCollabDialogOpen] = useState(false);
```

- [ ] **Step 3: Add role-based rendering logic**

Extract role from playlist:

```typescript
  const role = playlist.role || "owner";
  const isOwner = role === "owner";
  const isCollaborator = role === "collaborator";
```

- [ ] **Step 4: Conditionally show owner-only controls**

Wrap the edit (pencil) and delete (trash) buttons with `{isOwner && ...}`. Also wrap drag-and-drop handlers with owner check.

In the action buttons section (after the play button), replace with:

```typescript
              {isOwner && (
                <>
                  <button
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-white/40 hover:text-white"
                    onClick={() => setIsEditing(true)}
                    type="button"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-red-400/60 hover:text-red-400"
                    disabled={deletePlaylistMutation.isPending}
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
              {isOwner && (
                <button
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/70 transition hover:border-lime-300/40 hover:text-lime-300"
                  onClick={() => setIsCollabDialogOpen(true)}
                  type="button"
                >
                  <Users className="h-4 w-4" />
                </button>
              )}
```

- [ ] **Step 5: Add track attribution display**

In the track row, after the title/artist section, add addedBy display:

```typescript
                    {/* Added by */}
                    {track.addedBy && (
                      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                        {track.addedBy.image ? (
                          <Image
                            alt={track.addedBy.name || ""}
                            className="h-5 w-5 rounded-full object-cover"
                            height={20}
                            src={track.addedBy.image}
                            unoptimized
                            width={20}
                          />
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-white/50">
                            {(track.addedBy.name || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs text-white/30">{track.addedBy.name || "Unknown"}</span>
                      </div>
                    )}
```

- [ ] **Step 6: Conditionally show delete button per track based on role**

Replace the track delete button logic. Only show delete button if:
- User is owner (can delete any track), OR
- User is collaborator AND `track.addedBy?.id === session user id`

Since we don't have the session user ID on the client easily, we need to pass it or use a different approach. The simplest approach: use `useSession` from `next-auth/react`.

Add import:

```typescript
import { useSession } from "next-auth/react";
```

Add in component:

```typescript
const { data: session } = useSession();
```

Update delete button visibility:

```typescript
                    {/* Delete button */}
                    {(isOwner || (isCollaborator && track.addedBy?.id === session?.user?.id)) && (
                      <button
                        className="shrink-0 text-white/30 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                        disabled={deletingTrackId === track.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingTrackId(track.id);
                          setActionError(null);
                          deleteTrackMutation.mutate({ trackId: track.id });
                        }}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
```

- [ ] **Step 7: Disable drag-and-drop for collaborators**

On the track row div, conditionally set `draggable`:

```typescript
draggable={isOwner}
```

And wrap the `onDragStart`, `onDragEnd`, `onDrop`, `onDragOver` handlers so they only fire for owners:

```typescript
onDragStart={isOwner ? () => setDraggingTrackId(track.id) : undefined}
onDragEnd={isOwner ? () => setDraggingTrackId(null) : undefined}
onDragOver={isOwner ? (event) => event.preventDefault() : undefined}
onDrop={isOwner ? () => { /* existing drop logic */ } : undefined}
```

- [ ] **Step 8: Add ManageCollaboratorsDialog at end of component**

Before the closing `</div>` of the component return, add:

```typescript
      <ManageCollaboratorsDialog
        onClose={() => setIsCollabDialogOpen(false)}
        open={isCollabDialogOpen}
        playlistId={playlistId}
        playlistName={playlist.name}
      />
```

- [ ] **Step 9: Commit**

```bash
git add src/components/playlist-detail-view.tsx
git commit -m "feat: add role-based UI, track attribution, and collaborator management to playlist detail view

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 14: UI — Invite Accept Page

The invite page lives inside `(app)` which requires auth via the layout. The `(app)` layout does `redirect("/sign-in")` for unauthenticated users, which means they'll land on the sign-in page. After sign-in, NextAuth redirects to the default callback URL (usually `/`). The user won't lose the invite URL because they can revisit the link. This is acceptable for now since the token is single-use but remains valid until used.

**Files:**
- Create: `src/app/(app)/invite/[token]/page.tsx`

- [ ] **Step 1: Create the invite accept page**

Create `src/app/(app)/invite/[token]/page.tsx`:

```typescript
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { use } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type InviteInfo = {
  used: boolean;
  expired: boolean;
  type: string;
  playlist: {
    id: string;
    name: string;
    cover: string;
    ownerName: string;
  };
};

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const {
    data: inviteInfo,
    isLoading,
    error,
  } = useQuery<InviteInfo>({
    queryKey: ["invite", token],
    queryFn: async () => {
      const res = await fetch(`/api/playlists/invite/${token}`);
      const payload = (await res.json()) as { invite?: InviteInfo; message?: string };
      if (!res.ok) throw new Error(payload.message || "Failed to load invite");
      return payload.invite!;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/playlists/invite/${token}`, { method: "POST" });
      const payload = (await res.json()) as { playlist?: { id: string }; message?: string };
      if (!res.ok) throw new Error(payload.message || "Failed to accept invite");
      return payload.playlist;
    },
    onSuccess: (playlist) => {
      if (playlist?.id) {
        router.push(`/library/${playlist.id}`);
      } else {
        router.push("/library");
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-white/70">Loading invite...</p>
      </div>
    );
  }

  if (error || !inviteInfo) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-300">
          {error instanceof Error ? error.message : "Invite not found"}
        </p>
        <Button onClick={() => router.push("/library")} type="button" variant="ghost">
          Go to Library
        </Button>
      </div>
    );
  }

  if (inviteInfo.used) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-white/70">This invite has already been used.</p>
        <Button onClick={() => router.push("/library")} type="button" variant="ghost">
          Go to Library
        </Button>
      </div>
    );
  }

  if (inviteInfo.expired) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-white/70">This invite has expired.</p>
        <Button onClick={() => router.push("/library")} type="button" variant="ghost">
          Go to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6">
      <Image
        alt={inviteInfo.playlist.name}
        className="h-40 w-40 rounded-2xl object-cover"
        height={160}
        src={inviteInfo.playlist.cover}
        unoptimized
        width={160}
      />
      <div className="text-center">
        <h2 className="text-xl font-bold">{inviteInfo.playlist.name}</h2>
        <p className="mt-1 text-sm text-white/50">
          {inviteInfo.playlist.ownerName} invited you to collaborate
        </p>
      </div>

      {acceptMutation.error && (
        <p className="text-sm text-red-300">
          {acceptMutation.error instanceof Error
            ? acceptMutation.error.message
            : "Failed to accept invite"}
        </p>
      )}

      <Button
        disabled={acceptMutation.isPending}
        onClick={() => acceptMutation.mutate()}
        type="button"
      >
        {acceptMutation.isPending ? "Joining..." : "Accept Invite"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/invite/
git commit -m "feat: add invite accept page at /invite/[token]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 15: Wire Up ManageTracksDialog for Owners and Collaborators

**Files:**
- Modify: `src/components/playlist-detail-view.tsx`

The `ManageTracksDialog` is already used in `quiz-view.tsx` with full YouTube search wiring. Follow that same pattern: inline YouTube search state, add/remove mutations, and a preview stub (preview can be omitted for simplicity — pass a no-op).

- [ ] **Step 1: Add YouTube search state and mutations**

Add these state variables inside the `PlaylistDetailView` component:

```typescript
  const [isManageTracksOpen, setIsManageTracksOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [searchNextPageToken, setSearchNextPageToken] = useState<string | null>(null);
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [savingTrackId, setSavingTrackId] = useState<string | null>(null);
  const [removingTrackId, setRemovingTrackId] = useState<string | null>(null);

  const searchResultsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchSentinelRef = useRef<HTMLDivElement | null>(null);
```

Add import at top:

```typescript
import { useCallback } from "react";
```

- [ ] **Step 2: Add YouTube search function**

```typescript
  const onSearchTracks = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      setSearchNextPageToken(null);
      setHasMoreSearchResults(false);
      setActiveSearchTerm("");
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const payload = (await response.json()) as { tracks?: Track[]; nextPageToken?: string; hasMore?: boolean; message?: string };
      if (!response.ok) throw new Error(payload.message || "Search failed");
      setActiveSearchTerm(trimmed);
      setSearchResults(payload.tracks ?? []);
      setSearchNextPageToken(payload.nextPageToken ?? null);
      setHasMoreSearchResults(Boolean(payload.hasMore));
    } catch (err) {
      setSearchResults([]);
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setSearchNextPageToken(null);
      setHasMoreSearchResults(false);
      setActiveSearchTerm("");
    } finally {
      setIsSearching(false);
    }
  }, []);
```

- [ ] **Step 3: Add infinite scroll loader**

```typescript
  const loadMoreSearchResults = useCallback(async () => {
    if (!searchNextPageToken || !hasMoreSearchResults || isLoadingMoreSearch || isSearching || !activeSearchTerm) return;
    setIsLoadingMoreSearch(true);
    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(activeSearchTerm)}&pageToken=${encodeURIComponent(searchNextPageToken)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as { tracks?: Track[]; nextPageToken?: string; hasMore?: boolean; message?: string };
      if (!response.ok) throw new Error(payload.message || "Failed to load more");
      setSearchResults((prev) => {
        const merged = [...prev, ...(payload.tracks ?? [])];
        const unique = new Map<string, Track>();
        for (const t of merged) unique.set(t.id, t);
        return [...unique.values()];
      });
      setSearchNextPageToken(payload.nextPageToken ?? null);
      setHasMoreSearchResults(Boolean(payload.hasMore));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setIsLoadingMoreSearch(false);
    }
  }, [activeSearchTerm, hasMoreSearchResults, isLoadingMoreSearch, isSearching, searchNextPageToken]);

  useEffect(() => {
    const sentinel = searchSentinelRef.current;
    if (!sentinel || !searchResults.length) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) void loadMoreSearchResults(); },
      { root: null, rootMargin: "120px", threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreSearchResults, searchResults.length]);
```

- [ ] **Step 4: Add save/remove track mutations for the dialog**

```typescript
  const saveTrackMutation = useMutation({
    mutationFn: async ({ track }: { track: Track }) => {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Failed to add track");
      }
    },
    onSuccess: async () => {
      setSavingTrackId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlist-tracks", playlistId] }),
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
      ]);
    },
    onError: () => {
      setSavingTrackId(null);
    },
  });

  const removeTrackFromDialogMutation = useMutation({
    mutationFn: async ({ trackId }: { trackId: string }) => {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message || "Failed to remove track");
      }
    },
    onSuccess: async () => {
      setRemovingTrackId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlist-tracks", playlistId] }),
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
      ]);
    },
    onError: () => {
      setRemovingTrackId(null);
    },
  });
```

- [ ] **Step 5: Add existingTrackIds memo**

```typescript
  const existingTrackIds = useMemo(() => new Set(tracks.map((t) => t.id)), [tracks]);
```

- [ ] **Step 6: Add "Manage Tracks" button in action buttons area**

In the `!isEditing` block, after the play button, add (visible to both owner and collaborator):

```typescript
              {(isOwner || isCollaborator) && (
                <Button
                  className="h-10 rounded-full"
                  onClick={() => setIsManageTracksOpen(true)}
                  type="button"
                  variant="ghost"
                >
                  Manage Tracks
                </Button>
              )}
```

- [ ] **Step 7: Add ManageTracksDialog to the component JSX**

Before the closing `</div>` of the component, add:

```typescript
      <ManageTracksDialog
        open={isManageTracksOpen}
        playlistName={playlist.name}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearch={(q) => void onSearchTracks(q)}
        isSearching={isSearching}
        searchError={searchError}
        searchResults={searchResults}
        searchResultsContainerRef={searchResultsContainerRef}
        searchSentinelRef={searchSentinelRef}
        isLoadingMoreSearch={isLoadingMoreSearch}
        hasMoreSearchResults={hasMoreSearchResults}
        existingTrackIds={existingTrackIds}
        savingTrackId={savingTrackId}
        removingTrackId={removingTrackId}
        previewingTrackId={null}
        snippetDurationSeconds={10}
        onPreview={() => {}}
        onStopPreview={() => {}}
        onAddTrack={(track) => {
          setSavingTrackId(track.id);
          saveTrackMutation.mutate({ track });
        }}
        onRemoveTrack={(trackId) => {
          setRemovingTrackId(trackId);
          removeTrackFromDialogMutation.mutate({ trackId });
        }}
        currentTracks={tracks}
        onClose={() => {
          setIsManageTracksOpen(false);
          setSearchQuery("");
          setSearchResults([]);
          setSearchError(null);
        }}
      />
```

Add import at top:

```typescript
import { ManageTracksDialog } from "@/components/manage-tracks-dialog";
```

- [ ] **Step 8: Commit**

```bash
git add src/components/playlist-detail-view.tsx
git commit -m "feat: wire ManageTracksDialog for owners and collaborators in playlist detail view

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 16: Verify and Test End-to-End

- [ ] **Step 1: Run Prisma generate to ensure schema is valid**

```bash
npx prisma generate
```

Expected: No errors.

- [ ] **Step 2: Run TypeScript type checking**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Run the dev server and manually test**

```bash
npm run dev
```

Test the following flows:
1. Create a playlist as User A
2. Open playlist detail -> click collaborator (Users) button
3. Invite User B by email
4. Generate an invite link and copy it
5. Login as User B -> see pending invite in library
6. Accept the invite
7. Verify playlist appears in User B's collaborative playlists
8. As User B, add a track to the playlist
9. Verify track attribution shows User B's name
10. As User B, try to remove a track added by User A -> should fail
11. As User B, remove a track they added -> should succeed
12. Open invite link in another browser -> test the accept flow
13. As User A, verify all tracks and collaborators show correctly

- [ ] **Step 4: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: address issues found during collaborative playlists testing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
