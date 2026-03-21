import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { enforcePlaylistWriteRateLimit } from "@/lib/api-security";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";

const playlistParamsSchema = z.object({
  id: z.string().cuid(),
});

const createInviteSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("email"), email: z.string().email() }),
  z.object({ type: z.literal("link") }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = playlistParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid playlist id",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const { id } = parsedParams.data;
    const playlist = await db.playlist.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const rateLimited = await enforcePlaylistWriteRateLimit(request, session.user.id, "create-invite");
    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return apiError({
        status: 400,
        code: "INVALID_JSON",
        message: "Invalid JSON body",
      });
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

    // Check max 50 pending invites per playlist
    const pendingCount = await db.playlistInvite.count({
      where: { playlistId: id, used: false },
    });

    if (pendingCount >= 50) {
      return apiError({
        status: 422,
        code: "INVITE_LIMIT_REACHED",
        message: "Maximum of 50 pending invites per playlist",
      });
    }

    if (parsed.data.type === "email") {
      const normalizedEmail = parsed.data.email.toLowerCase();

      // Can't invite yourself
      if (session.user.email?.toLowerCase() === normalizedEmail) {
        return apiError({
          status: 400,
          code: "CANNOT_INVITE_SELF",
          message: "You cannot invite yourself",
        });
      }

      // Can't invite someone who's already a collaborator
      const existingCollaborator = await db.playlistCollaborator.findFirst({
        where: {
          playlistId: id,
          user: { email: normalizedEmail },
        },
      });

      if (existingCollaborator) {
        return apiError({
          status: 400,
          code: "ALREADY_COLLABORATOR",
          message: "This user is already a collaborator",
        });
      }

      // No duplicate pending email invite for same email
      const existingInvite = await db.playlistInvite.findFirst({
        where: {
          playlistId: id,
          type: "email",
          email: normalizedEmail,
          used: false,
        },
      });

      if (existingInvite) {
        return apiError({
          status: 400,
          code: "DUPLICATE_INVITE",
          message: "A pending invite already exists for this email",
        });
      }

      const invite = await db.playlistInvite.create({
        data: {
          playlistId: id,
          type: "email",
          email: normalizedEmail,
        },
      });

      return NextResponse.json(
        {
          id: invite.id,
          type: invite.type,
          email: invite.email,
          used: invite.used,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        },
        { status: 201 },
      );
    }

    // Link invite
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await db.playlistInvite.create({
      data: {
        playlistId: id,
        type: "link",
        expiresAt,
      },
    });

    return NextResponse.json(
      {
        id: invite.id,
        type: invite.type,
        token: invite.token,
        inviteUrl: `/invite/${invite.token}`,
        used: invite.used,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
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

    const parsedParams = playlistParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid playlist id",
        details: zodErrorDetails(parsedParams.error),
      });
    }

    const { id } = parsedParams.data;
    const playlist = await db.playlist.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!playlist) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const invites = await db.playlistInvite.findMany({
      where: { playlistId: id, used: false },
      orderBy: { createdAt: "desc" },
    });

    const result = invites.map((invite) => {
      if (invite.type === "link") {
        return {
          id: invite.id,
          type: invite.type,
          token: invite.token,
          inviteUrl: `/invite/${invite.token}`,
          used: invite.used,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        };
      }

      return {
        id: invite.id,
        type: invite.type,
        email: invite.email,
        used: invite.used,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch invites",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
