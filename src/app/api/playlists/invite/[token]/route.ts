import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getUserDisplayName } from "@/lib/user-display";

const tokenParamsSchema = z.object({
  token: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const parsedParams = tokenParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid invite token",
      });
    }

    const ip = getClientIp(request.headers);
    const rateLimit = await checkRateLimit(`invite-accept:${session.user.id}:${ip}`, {
      windowMs: 60_000,
      maxRequests: 10,
    });

    if (!rateLimit.allowed) {
      return apiError({
        status: 429,
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
        details: { retryAfterMs: rateLimit.retryAfterMs },
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
      return apiError({ status: 404, code: "NOT_FOUND", message: "Invite not found" });
    }

    // Check expiration
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return apiError({ status: 410, code: "INVITE_EXPIRED", message: "This invite has expired" });
    }

    // For email invites, check that accepting user's email matches
    if (invite.type === "email") {
      if (session.user.email?.toLowerCase() !== invite.email?.toLowerCase()) {
        return apiError({
          status: 403,
          code: "EMAIL_MISMATCH",
          message: "This invite was sent to a different email address",
        });
      }
    }

    // Can't be the playlist owner
    if (invite.playlist.userId === session.user.id) {
      return apiError({
        status: 400,
        code: "ALREADY_OWNER",
        message: "You are the owner of this playlist",
      });
    }

    // Can't already be a collaborator
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

    // Use interactive transaction to prevent race on collaborator count
    await db.$transaction(async (tx) => {
      const collaboratorCount = await tx.playlistCollaborator.count({
        where: { playlistId: invite.playlistId },
      });

      if (collaboratorCount >= 20) {
        throw new Error("MAX_COLLABORATORS");
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
    if (error instanceof Error && error.message === "MAX_COLLABORATORS") {
      return apiError({
        status: 422,
        code: "COLLABORATOR_LIMIT_REACHED",
        message: "Maximum of 20 collaborators per playlist",
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

    const parsedParams = tokenParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid invite token",
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
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });

    if (!invite) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Invite not found" });
    }

    const expired = invite.expiresAt ? invite.expiresAt < new Date() : false;

    return NextResponse.json({
      used: invite.used,
      expired,
      type: invite.type,
      playlist: {
        id: invite.playlist.id,
        name: invite.playlist.name,
        cover: invite.playlist.cover,
        ownerName: getUserDisplayName(invite.playlist.user.name, invite.playlist.user.email),
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
