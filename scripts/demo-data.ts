/**
 * DEV ONLY: fills the local database with sample transactions (only when it has none).
 *   npm run db:demo
 * Uses the real transaction service so every rule and balance path is exercised.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { createTransaction } from "@/lib/services/transactions";
import type { TransactionInput } from "@/lib/validations/transaction";
import { addDays, todayDateOnly } from "@/lib/dates";

async function main() {
  const user = await prisma.user.findFirstOrThrow({ where: { email: process.env.SEED_USER_EMAIL!.toLowerCase() } });
  const accounts = await prisma.account.findMany({ where: { userId: user.id } });
  const cats = await prisma.category.findMany({ where: { userId: user.id } });
  const acc = (name: string) => accounts.find((a) => a.name === name)!.id;
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const existing = await prisma.transaction.count({ where: { userId: user.id } });
  if (existing > 0) {
    console.log(`Already ${existing} transactions; skipping demo data.`);
    return;
  }
  await prisma.account.update({ where: { id: acc("Self Cash") }, data: { openingBalance: "4500" } });
  await prisma.account.update({ where: { id: acc("Self Bank") }, data: { openingBalance: "25000" } });
  await prisma.account.update({ where: { id: acc("Self UPI") }, data: { openingBalance: "2000" } });

  const today = todayDateOnly();
  const d = (daysAgo: number) => addDays(today, -daysAgo);
  const base = { owner: "SELF", notes: "" } as const;
  const rows: TransactionInput[] = [
    { ...base, type: "INCOME", amount: "40000", toAccountId: acc("Self Bank"), categoryId: cat("Salary"), paymentMode: "BANK", transactionDate: d(35), notes: "August salary" },
    { ...base, type: "INCOME", amount: "40000", toAccountId: acc("Self Bank"), categoryId: cat("Salary"), paymentMode: "BANK", transactionDate: d(5), notes: "September salary" },
    { ...base, type: "EXPENSE", amount: "250", fromAccountId: acc("Self Cash"), categoryId: cat("Food"), paymentMode: "CASH", transactionDate: d(0), notes: "Lunch" },
    { ...base, type: "EXPENSE", amount: "1200", fromAccountId: acc("Self UPI"), categoryId: cat("Food"), paymentMode: "UPI", transactionDate: d(1), notes: "Groceries" },
    { ...base, type: "EXPENSE", amount: "180", fromAccountId: acc("Self UPI"), categoryId: cat("Travel"), paymentMode: "UPI", transactionDate: d(2), notes: "Auto" },
    { ...base, type: "EXPENSE", amount: "2999", fromAccountId: acc("Self Bank"), categoryId: cat("Shopping"), paymentMode: "CARD", transactionDate: d(4), notes: "Shoes" },
    { ...base, type: "EXPENSE", amount: "1499", fromAccountId: acc("Self Bank"), categoryId: cat("Bills"), paymentMode: "BANK", transactionDate: d(6), notes: "Internet" },
    { ...base, type: "EXPENSE", amount: "600", fromAccountId: acc("Self Cash"), categoryId: cat("Entertainment"), paymentMode: "CASH", transactionDate: d(9), notes: "Movie" },
    { ...base, type: "EXPENSE", amount: "3400", fromAccountId: acc("Self UPI"), categoryId: cat("Food"), paymentMode: "UPI", transactionDate: d(40), notes: "Dinner out" },
    { ...base, type: "EXPENSE", amount: "5000", fromAccountId: acc("Self Bank"), categoryId: cat("Family"), paymentMode: "BANK", transactionDate: d(45), notes: "Home" },
    { ...base, type: "TRANSFER", amount: "5000", fromAccountId: acc("Self Bank"), toAccountId: acc("Self Cash"), paymentMode: "TRANSFER", transactionDate: d(7), notes: "ATM" },
    { ...base, type: "TRANSFER", amount: "3000", fromAccountId: acc("Self Bank"), toAccountId: acc("Self UPI"), paymentMode: "TRANSFER", transactionDate: d(3) },
    { ...base, type: "TRADING_DEPOSIT", amount: "20000", fromAccountId: acc("Self Bank"), toAccountId: acc("Self Trading"), paymentMode: "TRANSFER", transactionDate: d(30) },
    { ...base, type: "TRADING_PROFIT", amount: "3000", toAccountId: acc("Self Trading"), categoryId: cat("Trading Profit"), paymentMode: "OTHER", transactionDate: d(20), notes: "NIFTY calls" },
    { ...base, type: "TRADING_LOSS", amount: "1200", fromAccountId: acc("Self Trading"), paymentMode: "OTHER", transactionDate: d(12), notes: "Stop loss" },
    { ...base, type: "TRADING_WITHDRAWAL", amount: "2000", fromAccountId: acc("Self Trading"), toAccountId: acc("Self Bank"), paymentMode: "TRANSFER", transactionDate: d(8) },
    { type: "TRADING_DEPOSIT", amount: "50000", fromAccountId: acc("Self Bank"), toAccountId: acc("Brother Trading"), owner: "BROTHER", paymentMode: "TRANSFER", transactionDate: d(25), notes: "Brother's capital via my bank" },
    { type: "TRADING_PROFIT", amount: "7500", toAccountId: acc("Brother Trading"), owner: "BROTHER", categoryId: cat("Trading Profit"), paymentMode: "OTHER", transactionDate: d(10), notes: "" },
    { ...base, type: "BORROW", amount: "5000", toAccountId: acc("Self Cash"), personName: "Rahul", paymentMode: "CASH", transactionDate: d(15), notes: "For rent" },
    { ...base, type: "LEND", amount: "3000", fromAccountId: acc("Self UPI"), personName: "Amit", paymentMode: "UPI", transactionDate: d(11) },
  ];
  const created: { id: string; loanId: string | null; type: string }[] = [];
  for (const r of rows) created.push({ ...(await createTransaction(user.id, r)), type: r.type });
  const borrow = created.find((c) => c.type === "BORROW")!;
  const lend = created.find((c) => c.type === "LEND")!;
  await createTransaction(user.id, { ...base, type: "LOAN_REPAYMENT", amount: "2000", fromAccountId: acc("Self Cash"), loanId: borrow.loanId!, paymentMode: "CASH", transactionDate: d(4) });
  await createTransaction(user.id, { ...base, type: "LENT_REPAYMENT", amount: "1000", toAccountId: acc("Self UPI"), loanId: lend.loanId!, paymentMode: "UPI", transactionDate: d(2) });
  console.log(`Created ${rows.length + 2} demo transactions`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
