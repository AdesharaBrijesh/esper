/**
 * Idempotent seed. Safe to run on every container start.
 *
 *  - Creates the initial user from SEED_USER_EMAIL / SEED_USER_PASSWORD if it does not exist.
 *    (An existing user's password is never changed here.)
 *  - Ensures the default expense/income categories exist for that user.
 *  - Optionally creates clearly-named example accounts with a zero opening balance when the
 *    user has no accounts yet and SEED_EXAMPLE_ACCOUNTS=true.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../lib/constants";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const EXAMPLE_ACCOUNTS = [
  { name: "Self Cash", type: "CASH", owner: "SELF" },
  { name: "Self Bank", type: "BANK", owner: "SELF" },
  { name: "Self UPI", type: "UPI", owner: "SELF" },
  { name: "Self Trading", type: "TRADING", owner: "SELF" },
  { name: "Brother Trading", type: "TRADING", owner: "BROTHER" },
] as const;

async function main() {
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD;
  const name = process.env.SEED_USER_NAME?.trim() || "Me";

  if (!email || !password) {
    throw new Error("SEED_USER_EMAIL and SEED_USER_PASSWORD must be set");
  }
  if (password.length < 8 || password === "CHANGE_ME") {
    throw new Error("SEED_USER_PASSWORD must be at least 8 characters and not the placeholder");
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 12);
    user = await prisma.user.create({ data: { email, name, passwordHash } });
    console.log(`Created user ${email}`);
  } else {
    console.log(`User ${email} already exists (password unchanged)`);
  }

  let createdCategories = 0;
  const all = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({ ...c, type: "EXPENSE" as const, sortOrder: i })),
    ...DEFAULT_INCOME_CATEGORIES.map((c, i) => ({ ...c, type: "INCOME" as const, sortOrder: i })),
  ];
  for (const c of all) {
    const existing = await prisma.category.findUnique({
      where: { userId_type_name: { userId: user.id, type: c.type, name: c.name } },
    });
    if (!existing) {
      await prisma.category.create({
        data: { userId: user.id, name: c.name, type: c.type, icon: c.icon, color: c.color, sortOrder: c.sortOrder },
      });
      createdCategories += 1;
    }
  }
  console.log(`Categories: ${createdCategories} created, ${all.length - createdCategories} already present`);

  const wantExamples = (process.env.SEED_EXAMPLE_ACCOUNTS ?? "true").toLowerCase() === "true";
  const accountCount = await prisma.account.count({ where: { userId: user.id } });
  if (wantExamples && accountCount === 0) {
    await prisma.account.createMany({
      data: EXAMPLE_ACCOUNTS.map((a, i) => ({
        userId: user!.id,
        name: a.name,
        type: a.type,
        owner: a.owner,
        openingBalance: "0",
        sortOrder: i,
      })),
    });
    console.log(`Created ${EXAMPLE_ACCOUNTS.length} example accounts with zero balance (edit their opening balances)`);
  } else {
    console.log(`Accounts: ${accountCount} present, none created`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
