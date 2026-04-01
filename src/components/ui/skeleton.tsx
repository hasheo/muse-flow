import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-white/10", className)} {...props} />;
}

function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-4/5", "w-3/5", "w-2/3", "w-1/2"];
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", widths[i % widths.length])} />
      ))}
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-white/10 bg-black/35", className)}>
      <Skeleton className="h-44 w-full rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function SkeletonPlaylistGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonPlaylistGrid, SkeletonText };
