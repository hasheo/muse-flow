import Image from "next/image";

import { SignOutButton } from "@/components/sign-out-button";
import { TrackList } from "@/components/track-list";
import { tracks } from "@/lib/catalog";

export default function AppPage() {
  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">Welcome back</p>
          <h1 className="text-4xl font-bold tracking-tight">Flow Mix</h1>
        </div>
        <SignOutButton />
      </header>

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

      <TrackList tracks={tracks} />
    </>
  );
}
