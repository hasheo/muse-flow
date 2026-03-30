import { QuizView } from "@/components/quiz-view";

export default function QuizSetupPage() {
  return (
    <>
      <header className="mb-6 sm:mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50 sm:text-sm">Quiz creator</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Quiz Setup</h1>
      </header>

      <QuizView />
    </>
  );
}
