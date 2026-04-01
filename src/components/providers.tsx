"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { lazy, Suspense, useState } from "react";

import { ToastProvider } from "@/components/ui/toast";

const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then((mod) => ({
          default: mod.ReactQueryDevtools,
        })),
      )
    : () => null;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {children}
        </ToastProvider>
        <Suspense>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      </QueryClientProvider>
    </SessionProvider>
  );
}
