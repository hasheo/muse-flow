"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
      type="button"
    >
      Sign out
    </button>
  );
}
