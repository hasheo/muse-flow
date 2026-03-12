import Link from "next/link";

import { Button } from "@/components/ui/button";
import { QuizPublicLibraryView } from "@/components/quiz-public-library-view";

export default function QuizPage() {
  return (
    <>
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50 sm:text-sm">Challenge mode</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Public Music Quiz</h1>
        </div>
        <Link href="/quiz/setup">
          <Button type="button" variant="ghost">
            Quiz Setup
          </Button>
        </Link>
      </header>

      <QuizPublicLibraryView />
    </>
  );
}
