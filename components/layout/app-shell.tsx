import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import type { CurrentUser } from "@/lib/auth/dal";

/**
 * Responsive shell: sidebar on md+ screens, bottom navigation on phones.
 * Pages render inside a centered column with comfortable padding.
 */
export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-12 xl:max-w-6xl xl:px-10 2xl:max-w-7xl">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
