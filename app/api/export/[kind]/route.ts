import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { toCsv } from "@/lib/csv";
import { getTransactionsForExport } from "@/lib/data/transactions";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getPeopleLedger } from "@/lib/data/people";
import { getPlans } from "@/lib/data/plans";
import { parseTransactionFilters } from "@/lib/validations/filters";
import {
  ACCOUNT_TYPE_LABELS,
  OWNER_LABELS,
  PAYMENT_MODE_LABELS,
  PLAN_FREQUENCY_LABELS,
  PLAN_KIND_LABELS,
  PLAN_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/constants";
import { todayDateOnly } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** "loans" is kept as an alias of "people" so old bookmarks still download something useful. */
const KINDS = ["transactions", "accounts", "people", "loans", "plans"] as const;
type Kind = (typeof KINDS)[number];

function csvResponse(filename: string, csv: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[kind]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind } = await ctx.params;
  if (!KINDS.includes(kind as Kind)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }
  const stamp = todayDateOnly();

  try {
    if (kind === "transactions") {
      const params = Object.fromEntries(request.nextUrl.searchParams.entries());
      const filters = parseTransactionFilters(params);
      const rows = await getTransactionsForExport(user.id, filters);
      const csv = toCsv([
        ["Date", "Type", "Amount (INR)", "Owner", "Payment Mode", "Category", "From Account", "To Account", "Person", "Notes", "ID"],
        ...rows.map((t) => [
          t.transactionDate,
          TRANSACTION_TYPE_LABELS[t.type],
          t.amount,
          OWNER_LABELS[t.owner],
          PAYMENT_MODE_LABELS[t.paymentMode],
          t.category?.name ?? "",
          t.fromAccount?.name ?? "",
          t.toAccount?.name ?? "",
          t.person?.name ?? t.loan?.personName ?? "",
          t.notes ?? "",
          t.id,
        ]),
      ]);
      return csvResponse(`transactions-${stamp}.csv`, csv);
    }

    if (kind === "accounts") {
      const rows = await getAccountsWithBalances(user.id, { includeInactive: true });
      const csv = toCsv([
        ["Name", "Type", "Owner", "Opening Balance (INR)", "Current Balance (INR)", "Active", "ID"],
        ...rows.map((a) => [
          a.name,
          ACCOUNT_TYPE_LABELS[a.type],
          OWNER_LABELS[a.owner],
          a.openingBalance,
          a.balance,
          a.isActive ? "Yes" : "No",
          a.id,
        ]),
      ]);
      return csvResponse(`accounts-${stamp}.csv`, csv);
    }

    if (kind === "plans") {
      const rows = await getPlans(user.id, { status: "ALL" });
      const csv = toCsv([
        [
          "Name",
          "Type",
          "Provider",
          "Amount (INR)",
          "Frequency",
          "Owner",
          "Status",
          "Start Date",
          "End Date",
          "Instalments",
          "Paid",
          "Pending",
          "Paid (INR)",
          "Remaining (INR)",
          "Next Due",
          "ID",
        ],
        ...rows.map((p) => [
          p.name,
          PLAN_KIND_LABELS[p.kind],
          p.provider ?? "",
          p.amount,
          PLAN_FREQUENCY_LABELS[p.frequency],
          OWNER_LABELS[p.owner],
          PLAN_STATUS_LABELS[p.status],
          p.startDate,
          p.endDate ?? "",
          p.progress.total,
          p.progress.paid,
          p.progress.pending,
          p.progress.paidAmount,
          p.progress.remainingAmount,
          p.progress.nextDue?.dueDate ?? "",
          p.id,
        ]),
      ]);
      return csvResponse(`plans-${stamp}.csv`, csv);
    }

    const ledger = await getPeopleLedger(user.id);
    const csv = toCsv([
      ["Person", "Standing", "Balance (INR)", "You gave (INR)", "You got (INR)", "Entries", "Last activity", "Phone", "ID"],
      ...ledger.people.map((p) => {
        const b = Number(p.balance);
        return [
          p.name,
          b > 0 ? "Owes you" : b < 0 ? "You owe" : "Settled",
          p.balance.replace(/^-/, ""),
          p.gave,
          p.got,
          String(p.entryCount),
          p.lastActivity ?? "",
          p.phone ?? "",
          p.id,
        ];
      }),
    ]);
    return csvResponse(`people-${stamp}.csv`, csv);
  } catch (err) {
    console.error("[export] failed", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
