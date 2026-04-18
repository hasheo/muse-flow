"use client";

import { Headphones, LogOut, ShieldCheck } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export function QuizTopbar() {
  const { data: session } = useSession();
  const [showMenu, setShowMenu] = useState(false);

  const userImage = session?.user?.image;
  const userName = session?.user?.name ?? session?.user?.email ?? "";

  return (
    <header className="relative z-20 flex items-center justify-between px-4 py-3 sm:px-6">
      <Link className="flex items-center gap-2" href="/quiz">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-lime-400 text-sm font-black text-black shadow-[0_0_20px_rgba(163,230,53,0.6)]">
          M
        </div>
        <span className="text-sm font-black uppercase tracking-[0.2em] text-white sm:text-base">
          MuseFlow
        </span>
      </Link>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          className="group flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-lime-400/60 hover:bg-lime-400/10 hover:text-white sm:px-4 sm:text-sm"
          href="/player"
        >
          <Headphones className="h-3.5 w-3.5 transition group-hover:text-lime-300 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Switch to player</span>
          <span className="sm:hidden">Player</span>
        </Link>

        <div className="relative">
          <button
            className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 transition hover:border-white/30"
            onClick={() => setShowMenu((prev) => !prev)}
            type="button"
          >
            {userImage ? (
              <Image
                alt={userName}
                className="h-full w-full object-cover"
                height={36}
                src={userImage}
                unoptimized
                width={36}
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
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-gray-900 py-1 shadow-xl">
                <div className="border-b border-white/10 px-4 py-2.5">
                  <p className="truncate text-sm font-medium text-white">{userName}</p>
                  {session?.user?.email ? (
                    <p className="truncate text-xs text-white/50">{session.user.email}</p>
                  ) : null}
                </div>
                {session?.user?.isAdmin ? (
                  <Link
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                    href="/admin/catalog"
                    onClick={() => setShowMenu(false)}
                  >
                    <ShieldCheck className="h-4 w-4 text-lime-300" />
                    Admin catalog
                  </Link>
                ) : null}
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
      </div>
    </header>
  );
}
