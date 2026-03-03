import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { AudioEngine } from "@/components/player/audio-engine";
import { PlayerBar } from "@/components/player-bar";
import { Sidebar } from "@/components/sidebar";
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
    <main className="flex min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(132,204,22,0.2),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(20,184,166,0.24),transparent_30%),linear-gradient(180deg,#020617_0%,#111827_70%)] pb-32 text-white">
      <Sidebar />
      <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">{children}</section>
      <AudioEngine />
      <PlayerBar />
    </main>
  );
}
