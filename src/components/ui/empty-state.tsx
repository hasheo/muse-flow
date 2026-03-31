import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
};

function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/35 p-8 text-center", className)}>
      {icon ? <div className="mb-3 flex justify-center text-white/30 [&>svg]:h-10 [&>svg]:w-10">{icon}</div> : null}
      <p className="text-lg font-semibold text-white">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-sm text-sm text-white/65">{description}</p> : null}
      {action ? (
        <div className="mt-5">
          {action.href ? (
            <Button asChild>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
