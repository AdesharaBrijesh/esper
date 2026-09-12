/**
 * Emergency password reset — the recovery path for a single-user, self-hosted app.
 *
 *   npm run reset-password -- you@example.com "new-password"
 *   docker compose exec app node_modules/.bin/tsx scripts/reset-password.ts you@example.com "new-password"
 *
 * Bumps sessionVersion, so every existing session on every device is signed out.
 * Omit the password and one is generated for you.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const MIN_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

function generatePassword(): string {
  // Base64url of 12 bytes: 16 characters, no ambiguous punctuation to retype.
  return randomBytes(12).toString("base64url");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const [emailArg, passwordArg] = process.argv.slice(2);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
    if (users.length === 0) {
      console.error("No users exist yet. Run the seed first (npm run db:seed).");
      process.exit(1);
    }

    // With a single user, naming the email is optional.
    const email = emailArg?.trim().toLowerCase();
    const user = email ? users.find((u) => u.email.toLowerCase() === email) : users.length === 1 ? users[0] : undefined;

    if (!user) {
      console.error(
        email
          ? `No user with email ${email}. Known: ${users.map((u) => u.email).join(", ")}`
          : `Several users exist; pass one of: ${users.map((u) => u.email).join(", ")}`,
      );
      process.exit(1);
    }

    const generated = !passwordArg;
    const password = passwordArg ?? generatePassword();
    if (password.length < MIN_LENGTH) {
      console.error(`Password must be at least ${MIN_LENGTH} characters.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });

    console.log(`Password reset for ${user.email} (${user.name}).`);
    if (generated) console.log(`New password: ${password}`);
    console.log("All existing sessions have been signed out.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
