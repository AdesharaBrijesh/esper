import {
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  CreditCard,
  Home,
  Landmark,
  LineChart,
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
  /**
   * Extra prefixes this item stands in for. Used by the mobile "More" tab, which is the
   * entry point to every screen the four-slot bottom bar cannot show. The sidebar lists
   * those screens individually and so never sets this.
   */
  matchAny?: string[];
}

/** Screens the four-slot bottom bar has no room for; "More" lights up for all of them. */
const MORE_SECTIONS = [
  "/settings",
  "/accounts",
  "/cards",
  "/investments",
  "/trading",
  "/loans",
  "/reports",
  "/categories",
];

/**
 * Bottom navigation (mobile). The Add button is rendered separately in the middle.
 *
 * Four slots only, so each has to earn its place: Home and Activity are where you look,
 * Plans is what the app remembers for you, and More reaches everything else.
 */
export const MOBILE_NAV: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { href: "/", label: "Home", icon: Home },
    { href: "/transactions", label: "Activity", icon: ListOrdered },
  ],
  right: [
    { href: "/plans", label: "Plans", icon: CalendarClock },
    { href: "/settings", label: "More", icon: Settings, matchAny: MORE_SECTIONS },
  ],
};

/** Sidebar navigation (desktop). */
export const SIDEBAR_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Activity", icon: ListOrdered },
  { href: "/plans", label: "Plans", icon: CalendarClock },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/cards", label: "Cards", icon: CreditCard },
  { href: "/investments", label: "Investments", icon: LineChart },
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
  const prefixes = item.matchAny ?? [base];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
