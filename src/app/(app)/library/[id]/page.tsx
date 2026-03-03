import { notFound } from "next/navigation";

import { PlaylistDetailView } from "@/components/playlist-detail-view";
import { SignOutButton } from "@/components/sign-out-button";

export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">Your collection</p>
          <h1 className="text-4xl font-bold tracking-tight">Playlist Detail</h1>
        </div>
        <SignOutButton />
      </header>

      <PlaylistDetailView playlistId={id} />
    </>
  );
}
