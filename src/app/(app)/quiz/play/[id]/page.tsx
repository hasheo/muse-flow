import { QuizPlayView } from "@/components/quiz-play-view";
import { SignOutButton } from "@/components/sign-out-button";

export default async function QuizPlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">Challenge mode</p>
          <h1 className="text-4xl font-bold tracking-tight">Play Quiz</h1>
        </div>
        <SignOutButton />
      </header>

      <QuizPlayView playlistId={id} />
    </>
  );
}
