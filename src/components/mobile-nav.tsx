"use client";

import { Gamepad2, Headphones, Home, Library, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

type NavItem =
  | { href: string; label: string; icon: typeof Home; isSearch?: false; match: (p: string) => boolean }
  | { href: string; label: string; icon: typeof Search; isSearch: true; match: (p: string) => boolean };

const navItems: NavItem[] = [
  { href: "/app", label: "Home", icon: Home, match: (p) => p === "/app" },
  { href: "/app?focus=search", label: "Search", icon: Search, isSearch: true, match: () => false },
  { href: "/library", label: "Library", icon: Library, match: (p) => p.startsWith("/library") },
  { href: "/quiz", label: "Quiz", icon: Gamepad2, match: (p) => p === "/quiz" || p.startsWith("/quiz/") },
  { href: "/quiz-companion", label: "Companion", icon: Headphones, match: (p) => p.startsWith("/quiz-companion") },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/90 backdrop-blur-xl lg:hidden">
      <div className="flex items-stretch">
        {navItems.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;

          if (item.isSearch) {
            return (
              <button
                key={item.label}
                className="flex flex-1 flex-col items-center gap-1 py-2.5 text-white/50 transition active:text-white"
                onClick={() => {
                  if (pathname !== "/app") {
                    router.push("/app?focus=search");
                  } else {
                    window.dispatchEvent(new CustomEvent("focus-search"));
                  }
                }}
                type="button"
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 transition active:text-white",
                active ? "text-white" : "text-white/50",
              )}
              href={item.href}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
