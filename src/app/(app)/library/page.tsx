import { LibraryView } from "@/components/library-view";
import { SignOutButton } from "@/components/sign-out-button";

export default function LibraryPage() {
  return (
    <>
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/50">Your collection</p>
          <h1 className="text-4xl font-bold tracking-tight">Library</h1>
        </div>
        <SignOutButton />
      </header>

      <LibraryView />
    </>
  );
}
