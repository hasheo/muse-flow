import { LibraryView } from "@/components/library-view";

export default function LibraryPage() {
  return (
    <>
      <header className="mb-6 sm:mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50 sm:text-sm">Your collection</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Library</h1>
      </header>

      <LibraryView />
    </>
  );
}
