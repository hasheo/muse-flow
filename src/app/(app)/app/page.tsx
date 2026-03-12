import { getServerSession } from "next-auth";
import Image from "next/image";

import { TrackList } from "@/components/track-list";
import { tracks } from "@/lib/catalog";
import { authOptions } from "@/lib/auth";

export default async function AppPage() {
  const session = await getServerSession(authOptions);
  const username = session?.user?.name ?? "there";

  return (
    <>
      <header className="mb-6 sm:mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50 sm:text-sm">Welcome back</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">{username}</h1>
      </header>

      {tracks.length > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {tracks.map((track) => (
            <article className="overflow-hidden rounded-2xl border border-white/10 bg-black/35" key={track.id}>
              <Image
                alt={track.title}
                className="h-36 w-full object-cover"
                height={144}
                priority={track.id === tracks[0]?.id}
                src={track.cover}
                unoptimized
                width={420}
              />
              <div className="p-4">
                <p className="font-semibold">{track.title}</p>
                <p className="text-sm text-white/70">{track.artist}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <TrackList tracks={tracks} />
    </>
  );
}
