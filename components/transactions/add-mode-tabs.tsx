import Link from "next/link";
import { cn } from "@/lib/utils";

/** Switch between the full form and quick add. Links, so each mode has its own URL. */
export function AddModeTabs({ active, className }: { active: "form" | "quick"; className?: string }) {
  const tabs = [
    { key: "form", href: "/transactions/new", label: "Form" },
    { key: "quick", href: "/transactions/quick", label: "Quick list" },
  ] as const;
  return (
    <nav aria-label="Add mode" className={cn("flex w-full gap-1 rounded-xl bg-muted p-1", className)}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          replace
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "inline-flex h-9 flex-1 items-center justify-center rounded-lg text-sm font-medium transition-colors",
            active === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
