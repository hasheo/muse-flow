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
