import { QuizView } from "@/components/quiz-view";
import { SignOutButton } from "@/components/sign-out-button";

export default function QuizSetupPage() {
  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">Quiz creator</p>
          <h1 className="text-4xl font-bold tracking-tight">Quiz Setup</h1>
        </div>
        <SignOutButton />
      </header>

      <QuizView />
    </>
  );
}
