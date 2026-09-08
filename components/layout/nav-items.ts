import {
  ArrowLeftRight,
  BarChart3,
  Home,
  Landmark,
  ListOrdered,
  Settings,
  Tags,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Matches when the pathname starts with this prefix (defaults to href). */
  match?: string;
}

/** Bottom navigation (mobile). The Add button is rendered separately in the middle. */
export const MOBILE_NAV: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { href: "/", label: "Home", icon: Home },
    { href: "/transactions", label: "Activity", icon: ListOrdered },
  ],
  right: [
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
};

/** Sidebar navigation (desktop). */
export const SIDEBAR_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Activity", icon: ListOrdered },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/trading", label: "Trading", icon: TrendingUp },
  { href: "/loans", label: "People & Loans", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADD_NAV: NavItem = { href: "/transactions/new", label: "Add", icon: ArrowLeftRight };

export function isNavActive(pathname: string, item: NavItem): boolean {
  const base = item.match ?? item.href;
  if (base === "/") return pathname === "/";
  if (base === "/transactions") return pathname.startsWith("/transactions") && !pathname.startsWith("/transactions/new");
  return pathname === base || pathname.startsWith(`${base}/`);
}
