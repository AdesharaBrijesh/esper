"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { ADD_NAV, isNavActive, MOBILE_NAV, type NavItem } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("size-5", active && "stroke-[2.5]")} aria-hidden />
      {item.label}
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const onAdd = pathname.startsWith(ADD_NAV.href);
  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch px-2">
        {MOBILE_NAV.left.map((item) => (
          <NavLink key={item.href} item={item} active={isNavActive(pathname, item)} />
        ))}
        <div className="flex flex-1 items-center justify-center">
          <Link
            href={ADD_NAV.href}
            aria-label="Add transaction"
            className={cn(
              "-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95",
              onAdd && "bg-primary/90",
            )}
          >
            <Plus className="size-7" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>
        {MOBILE_NAV.right.map((item) => (
          <NavLink key={item.href} item={item} active={isNavActive(pathname, item)} />
        ))}
      </div>
    </nav>
  );
}
