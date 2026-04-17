import { QuizPlayView } from "@/components/quiz-play-view";

export default async function QuizPlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <header className="mb-6 sm:mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50 sm:text-sm">Challenge mode</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Play Quiz</h1>
      </header>

      <QuizPlayView playlistId={id} />
    </>
  );
}
