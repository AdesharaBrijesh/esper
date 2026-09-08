/**
 * DEV ONLY: prints a signed session cookie for the seed user so protected pages
 * can be fetched with curl during development:
 *
 *   npx tsx scripts/dev-session-cookie.ts
 *   curl -b "leno_session=<token>" http://localhost:3000/
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { sessionExpiryDate, signSessionToken } from "../lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "../lib/constants";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  const user = await prisma.user.findFirst(email ? { where: { email } } : undefined);
  if (!user) throw new Error("No user found; run `npm run db:seed` first");
  const token = await signSessionToken({ userId: user.id, sessionVersion: user.sessionVersion }, sessionExpiryDate());
  console.log(`${SESSION_COOKIE_NAME}=${token}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
