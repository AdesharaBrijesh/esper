import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/dal";

// Every screen inside the app depends on the session cookie and live data.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
