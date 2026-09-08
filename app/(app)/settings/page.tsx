import Link from "next/link";
import { ChevronRight, Download, ExternalLink, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { countTransactions } from "@/lib/data/transactions";
import { logoutAction } from "@/lib/actions/auth";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { PasswordForm } from "@/components/settings/password-form";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

export const metadata = { title: "Settings" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mb-3 text-xs text-muted-foreground">{description}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

const SHORTCUTS = [
  { href: "/accounts", label: "Accounts", hint: "Add, edit or archive accounts" },
  { href: "/categories", label: "Categories", hint: "Expense and income categories" },
  { href: "/loans", label: "People", hint: "Who you borrow from and lend to" },
  { href: "/trading", label: "Trading", hint: "Capital and results per owner" },
];

const EXPORTS = [
  { href: "/api/export/transactions", label: "Transactions" },
  { href: "/api/export/accounts", label: "Accounts" },
  { href: "/api/export/loans", label: "Loans" },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const [transactions, accounts, categories, people] = await Promise.all([
    countTransactions(user.id),
    prisma.account.count({ where: { userId: user.id } }),
    prisma.category.count({ where: { userId: user.id } }),
    prisma.person.count({ where: { userId: user.id } }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" />

      <Section title="Profile">
        <ProfileForm name={user.name} email={user.email} />
      </Section>

      <Section title="Password" description="Changing it signs out every other device.">
        <PasswordForm />
      </Section>

      <Section title="Appearance">
        <div className="flex items-center justify-between">
          <span className="text-sm">Theme</span>
          <ThemeToggle />
        </div>
      </Section>

      <Section title="Manage">
        <ul className="-mx-2 flex flex-col">
          {SHORTCUTS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="flex h-12 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Data" description={`${transactions} transactions · ${accounts} accounts · ${categories} categories · ${people} people`}>
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((e) => (
            <Button key={e.href} variant="outline" size="lg" className="h-10 rounded-xl" render={<a href={e.href} download />}>
              <Download className="size-4" aria-hidden />
              {e.label} CSV
            </Button>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Backups</p>
          <p className="mt-1">
            All data lives in the PostgreSQL container volume. On the server, run the backup script from the project folder; it stores a
            compressed dump in <code>./backups</code> (or <code>BACKUP_DIR</code>):
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-2 text-[11px]">
            <code>{`./scripts/backup.sh\n./scripts/restore.sh backups/leno-expenses_<date>.sql.gz`}</code>
          </pre>
          <p className="mt-2">
            Schedule it with cron, e.g. <code>30 2 * * * cd /opt/expense-tracker && ./scripts/backup.sh</code>. See the README for details.
          </p>
        </div>
      </Section>

      <Section title="App" description={`${APP_NAME} · self-hosted`}>
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Install on your phone</p>
            <p className="mt-1">
              Android Chrome: menu ⋮ → <em>Install app</em> / <em>Add to Home screen</em>. iPhone Safari: Share → <em>Add to Home Screen</em>.
            </p>
          </div>
          <a href="/api/health" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Server health <ExternalLink className="size-3" aria-hidden />
          </a>
          <form action={logoutAction}>
            <Button type="submit" variant="destructive" size="lg" className="h-11 w-full rounded-xl sm:w-auto">
              <LogOut className="size-4" aria-hidden />
              Log out
            </Button>
          </form>
        </div>
      </Section>
    </div>
  );
}
