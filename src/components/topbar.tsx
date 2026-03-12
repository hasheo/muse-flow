"use client";

import { LogOut, Search } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function Topbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showMenu, setShowMenu] = useState(false);

  const handleSearch = () => {
    const query = inputRef.current?.value.trim();
    if (!query) {
      // Just focus the search on the home page
      if (pathname !== "/app") {
        router.push("/app?focus=search");
      } else {
        window.dispatchEvent(new CustomEvent("focus-search"));
      }
      return;
    }

    if (pathname !== "/app") {
      router.push(`/app?focus=search&q=${encodeURIComponent(query)}`);
    } else {
      window.dispatchEvent(new CustomEvent("focus-search", { detail: query }));
    }
  };

  const userImage = session?.user?.image;
  const userName = session?.user?.name ?? session?.user?.email ?? "";

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-white/[0.06] bg-black/20 px-6 py-3 backdrop-blur-sm">
      {/* Search bar */}
      <form
        className="flex flex-1 items-center"
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch();
        }}
      >
        <div className="flex w-full max-w-md items-center gap-3 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 transition focus-within:border-white/25 focus-within:bg-white/[0.09]">
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-white placeholder-white/40 outline-none"
            placeholder="Search songs, albums, artists"
            type="text"
          />
        </div>
      </form>

      {/* User avatar */}
      <div className="relative">
        <button
          className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 transition hover:border-white/30"
          onClick={() => setShowMenu((prev) => !prev)}
          type="button"
        >
          {userImage ? (
            <Image
              alt={userName}
              className="h-full w-full object-cover"
              height={32}
              src={userImage}
              unoptimized
              width={32}
            />
          ) : (
            <span className="text-xs font-medium text-white/70">
              {userName.charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </button>

        {showMenu ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-gray-900 py-1 shadow-xl">
              <div className="border-b border-white/10 px-4 py-2.5">
                <p className="truncate text-sm font-medium text-white">{userName}</p>
                {session?.user?.email ? (
                  <p className="truncate text-xs text-white/50">{session.user.email}</p>
                ) : null}
              </div>
              <button
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                onClick={() => signOut({ callbackUrl: "/sign-in" })}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
