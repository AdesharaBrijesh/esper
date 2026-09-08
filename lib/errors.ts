/**
 * Errors that are safe to show to the user carry a plain-English message.
 * Anything else is logged and replaced by a generic message.
 */
export class AppError extends Error {
  readonly fieldErrors?: Record<string, string[]>;

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "AppError";
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found.`);
    this.name = "NotFoundError";
  }
}

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

interface PrismaLikeError {
  code?: string;
  name?: string;
  meta?: { target?: unknown; field_name?: unknown };
}

function isPrismaKnownError(err: unknown): err is PrismaLikeError & Error {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as PrismaLikeError).code === "string" &&
    (err as PrismaLikeError).code!.startsWith("P")
  );
}

/** Map any thrown value to a message that is safe to render in the UI. */
export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (isPrismaKnownError(err)) {
    switch (err.code) {
      case "P2002":
        return "A record with the same name already exists.";
      case "P2003":
        return "This record is still used by other data and cannot be removed.";
      case "P2025":
        return "The record no longer exists.";
      default:
        console.error("[db] prisma error", err.code, err.message);
        return "Database error. Please try again.";
    }
  }
  console.error("[app] unexpected error", err);
  return GENERIC_MESSAGE;
}

/** True when the error is a Next.js control-flow signal (redirect / notFound) that must be re-thrown. */
export function isNextControlFlowError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}
