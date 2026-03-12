import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { AudioEngine } from "@/components/player/audio-engine";
import { MobileNav } from "@/components/mobile-nav";
import { PlayerBar } from "@/components/player-bar";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { authOptions } from "@/lib/auth";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <main className="flex h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(132,204,22,0.2),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(20,184,166,0.24),transparent_30%),linear-gradient(180deg,#020617_0%,#111827_70%)] text-white">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black"
        href="#main-content"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <section className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-8 pb-40 sm:px-8 lg:pb-32" id="main-content">{children}</section>
      </div>
      <AudioEngine />
      <PlayerBar />
      <MobileNav />
    </main>
  );
}
