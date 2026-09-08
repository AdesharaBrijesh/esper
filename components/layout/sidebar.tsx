"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { isNavActive, SIDEBAR_NAV } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { logoutAction } from "@/lib/actions/auth";
import { APP_NAME } from "@/lib/constants";
import type { CurrentUser } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-lg text-primary-foreground">₹</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{APP_NAME}</p>
          <p className="truncate text-xs text-muted-foreground">{user.name}</p>
        </div>
      </div>

      <div className="px-4 pb-2">
        <Link
          href="/transactions/new"
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="size-4" strokeWidth={2.5} aria-hidden />
          Add transaction
        </Link>
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {SIDEBAR_NAV.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4.5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <ThemeToggle />
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
