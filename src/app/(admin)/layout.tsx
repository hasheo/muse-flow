import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ShieldCheck } from "lucide-react";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    redirect("/quiz");
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-[#05040d] text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/10 bg-black/70 px-4 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <ShieldCheck aria-hidden className="h-5 w-5 text-lime-300" />
          <span className="text-sm font-black uppercase tracking-[0.25em] text-white">
            MuseFlow Admin
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-white/70">
          <Link className="transition hover:text-white" href="/admin/catalog">
            Catalog
          </Link>
          <span className="text-white/20">|</span>
          <Link className="transition hover:text-white" href="/quiz">
            Back to quiz
          </Link>
        </div>
      </header>
      <section className="relative flex-1">{children}</section>
    </main>
  );
}
