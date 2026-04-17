import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { AudioEngine } from "@/components/player/audio-engine";
import { QuizTopbar } from "@/components/quiz/quiz-topbar";
import { authOptions } from "@/lib/auth";

export default async function QuizShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#05040d] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(163,230,53,0.22),transparent_45%),radial-gradient(circle_at_85%_20%,rgba(34,211,238,0.18),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(217,70,239,0.16),transparent_55%),linear-gradient(180deg,#05040d_0%,#0b0a1a_60%,#05040d_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0%,transparent_calc(100%_-_1px),rgba(255,255,255,0.04)_100%),linear-gradient(90deg,transparent_0%,transparent_calc(100%_-_1px),rgba(255,255,255,0.04)_100%)] bg-[size:48px_48px] opacity-40"
      />
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black"
        href="#main-content"
      >
        Skip to content
      </a>
      <QuizTopbar />
      <section
        className="relative z-10 flex w-full flex-1 flex-col"
        id="main-content"
      >
        {children}
      </section>
      <AudioEngine />
    </main>
  );
}
