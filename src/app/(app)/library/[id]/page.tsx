import { notFound } from "next/navigation";

import { PlaylistDetailView } from "@/components/playlist-detail-view";

export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  return <PlaylistDetailView playlistId={id} />;
}
