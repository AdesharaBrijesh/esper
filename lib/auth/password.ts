import "server-only";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * A real bcrypt hash of a throwaway string, compared against when no user matches so
 * that "unknown email" and "wrong password" take the same amount of time. Without it,
 * the fast path leaks which emails exist.
 */
const DUMMY_HASH = "$2b$12$sSjFBFtbebr9Jfhrgpc77.sWYR5dhG5F5j0zu9urSbHG7w5Y7azh6";

/** Burns the same work a real verification would, and always reports failure. */
export async function burnPasswordComparison(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}
