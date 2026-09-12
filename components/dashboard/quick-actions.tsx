import Link from "next/link";
import { ArrowLeftRight, Minus, Plus, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { href: "/transactions/new?type=EXPENSE", label: "Add Expense", icon: Minus, className: "bg-expense/10 text-expense" },
  { href: "/transactions/new?type=INCOME", label: "Add Income", icon: Plus, className: "bg-income/10 text-income" },
  { href: "/transactions/new?type=TRANSFER", label: "Transfer", icon: ArrowLeftRight, className: "bg-transfer/10 text-transfer" },
  { href: "/trading", label: "Trading", icon: TrendingUp, className: "bg-trading/10 text-trading" },
  { href: "/loans", label: "Borrow/Lend", icon: Users, className: "bg-loan/15 text-loan" },
];

export function QuickActions({ className }: { className?: string }) {
  return (
    <nav aria-label="Quick actions" className={cn("grid grid-cols-3 gap-2 sm:grid-cols-5", className)}>
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.href}
            href={a.href}
            className="press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card p-2 text-center text-xs font-medium hover:bg-muted/60"
          >
            <span className={cn("flex size-10 items-center justify-center rounded-xl", a.className)}>
              <Icon className="size-5" strokeWidth={2.25} aria-hidden />
            </span>
            {a.label}
          </Link>
        );
      })}
    </nav>
  );
}
