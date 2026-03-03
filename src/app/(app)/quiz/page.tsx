import Link from "next/link";

import { Button } from "@/components/ui/button";
import { QuizPublicLibraryView } from "@/components/quiz-public-library-view";
import { SignOutButton } from "@/components/sign-out-button";

export default function QuizPage() {
  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">Challenge mode</p>
          <h1 className="text-4xl font-bold tracking-tight">Public Music Quiz</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/quiz/setup">
            <Button type="button" variant="ghost">
              Quiz Setup
            </Button>
          </Link>
          <SignOutButton />
        </div>
      </header>

      <QuizPublicLibraryView />
    </>
  );
}
