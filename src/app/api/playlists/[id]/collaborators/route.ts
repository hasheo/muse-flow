import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { apiError, zodErrorDetails } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getPlaylistWithRole } from "@/lib/playlist-auth";

const playlistParamsSchema = z.object({
  id: z.string().cuid(),
});

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
    const result = await getPlaylistWithRole(id, session.user.id);

    if (!result || result.role === null) {
      return apiError({ status: 404, code: "NOT_FOUND", message: "Playlist not found" });
    }

    const collaborators = await db.playlistCollaborator.findMany({
      where: { playlistId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const response = collaborators.map((collab) => ({
      id: collab.id,
      userId: collab.user.id,
      name: collab.user.name,
      email: collab.user.email,
      image: collab.user.image,
      joinedAt: collab.joinedAt,
    }));

    return NextResponse.json(response);
  } catch (error) {
    return apiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch collaborators",
      details: error instanceof Error ? { reason: error.message } : undefined,
    });
  }
}
