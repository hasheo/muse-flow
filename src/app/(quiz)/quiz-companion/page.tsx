import { QuizCompanionView } from "@/components/quiz-companion-view";

export default function QuizCompanionPage() {
  return (
    <>
      <header className="mb-6 sm:mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50 sm:text-sm">Offline game mode</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Quiz Companion</h1>
      </header>

      <QuizCompanionView />
    </>
  );
}
