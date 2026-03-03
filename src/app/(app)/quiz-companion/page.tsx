import { QuizCompanionView } from "@/components/quiz-companion-view";
import { SignOutButton } from "@/components/sign-out-button";

export default function QuizCompanionPage() {
  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">Offline game mode</p>
          <h1 className="text-4xl font-bold tracking-tight">Quiz Companion</h1>
        </div>
        <SignOutButton />
      </header>

      <QuizCompanionView />
    </>
  );
}
