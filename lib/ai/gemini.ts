import "server-only";
import { AppError } from "@/lib/errors";

/**
 * Minimal Gemini client for structured extraction (free tier friendly).
 *
 * Plain fetch against the REST API, so there is no SDK to keep in step. Asks for JSON
 * that matches a schema, and walks a list of models: the free tier regularly answers
 * 503 "high demand" or 429 for one model while another still works, so a busy model
 * falls through to the next instead of failing the import.
 *
 * Config: GEMINI_API_KEY (required for AI features), GEMINI_MODEL (optional,
 * comma-separated list, tried in order).
 */

// Lite first: on these extraction tasks it was as accurate and answered in ~2s, while flash
// regularly sat on "high demand" for close to a minute before failing.
const DEFAULT_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"];
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** Per model attempt. A multi-page statement legitimately takes a while. */
const ATTEMPT_TIMEOUT_MS = 55_000;

export function isAiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY?.trim();
}

function models(): string[] {
  const fromEnv = process.env.GEMINI_MODEL?.split(",").map((m) => m.trim()).filter(Boolean);
  return fromEnv && fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** OpenAPI-subset schema accepted by Gemini's responseSchema. */
export type GeminiSchema =
  | { type: "STRING"; enum?: string[]; description?: string; nullable?: boolean }
  | { type: "NUMBER" | "INTEGER" | "BOOLEAN"; description?: string; nullable?: boolean }
  | { type: "ARRAY"; items: GeminiSchema; description?: string }
  | {
      type: "OBJECT";
      properties: Record<string, GeminiSchema>;
      required?: string[];
      propertyOrdering?: string[];
      description?: string;
    };

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

/** Errors worth trying the next model for. */
function isRetryable(status: number): boolean {
  return status === 404 || status === 408 || status === 429 || status >= 500;
}

/**
 * `busy` marks a fast "come back shortly" answer (429 / 503). Those spikes are brief, so
 * the same model is retried after a short pause before moving on; a timeout is not.
 */
class RetryableError extends Error {
  constructor(
    message: string,
    readonly busy = false,
  ) {
    super(message);
  }
}

/** Retries of a busy model, and the pause before each. */
const BUSY_BACKOFF_MS = [1500, 4000];
/** Stay inside the page's maxDuration (150s) with room to answer. */
const TOTAL_BUDGET_MS = 125_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callModel(model: string, apiKey: string, body: unknown, timeoutMs: number): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    // Timeout or network failure: another model may still answer.
    throw new RetryableError(err instanceof Error ? err.message : "Network error");
  }

  const json = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    const message = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 400 && /api key/i.test(message)) throw new AppError("The Gemini API key was rejected. Check GEMINI_API_KEY.");
    if (res.status === 401 || res.status === 403) throw new AppError("The Gemini API key was rejected. Check GEMINI_API_KEY.");
    if (isRetryable(res.status)) throw new RetryableError(`${model}: ${message}`, res.status === 429 || res.status === 503);
    throw new AppError(`The AI couldn't read this file (${message.slice(0, 160)}).`);
  }
  if (json.promptFeedback?.blockReason) {
    throw new AppError(`The AI refused to read this file (${json.promptFeedback.blockReason}).`);
  }
  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  if (!text.trim()) {
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new AppError("That file has more rows than the AI can return at once. Split it (e.g. one month per upload) and try again.");
    }
    throw new RetryableError(`${model}: empty response (${candidate?.finishReason ?? "no candidate"})`);
  }
  return text;
}

/**
 * One model: a normal attempt, plus short-pause retries while it answers "busy".
 * Records every failure in `failures`; `done` is false when the caller should move on.
 */
async function tryModel<T>(
  model: string,
  apiKey: string,
  body: unknown,
  deadline: number,
  failures: string[],
): Promise<{ done: true; value: T } | { done: false }> {
  for (let attempt = 0; attempt <= BUSY_BACKOFF_MS.length; attempt++) {
    // A slow attempt could not finish in what is left of the budget.
    if (Date.now() + 5_000 > deadline) return { done: false };
    const started = Date.now();
    let text: string;
    try {
      text = await callModel(model, apiKey, body, Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now()));
    } catch (err) {
      if (!(err instanceof RetryableError)) throw err;
      console.warn(`[ai] ${model} failed after ${Date.now() - started}ms: ${err.message.slice(0, 200)}`);
      failures.push(err.message);
      const pause = BUSY_BACKOFF_MS[attempt];
      if (!err.busy || pause === undefined) return { done: false };
      await sleep(pause);
      continue;
    }
    console.info(`[ai] ${model} answered in ${Date.now() - started}ms${attempt ? ` (retry ${attempt})` : ""}`);
    try {
      return { done: true, value: JSON.parse(text) as T };
    } catch {
      failures.push(`${model}: invalid JSON`);
      return { done: false };
    }
  }
  return { done: false };
}

/**
 * Sends `parts` with a system instruction and returns the parsed JSON object.
 * Throws AppError with a user-facing message when every model fails.
 */
export async function generateJson<T>({
  system,
  parts,
  schema,
  maxOutputTokens = 32_768,
}: {
  system: string;
  parts: GeminiPart[];
  schema: GeminiSchema;
  maxOutputTokens?: number;
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AppError("AI reading isn't set up. Add GEMINI_API_KEY to the server environment.");

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: schema,
      maxOutputTokens,
    },
  };

  const failures: string[] = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  for (const model of models()) {
    const result = await tryModel<T>(model, apiKey, body, deadline, failures);
    if (result.done) return result.value;
    if (Date.now() + 5_000 > deadline) break;
  }
  console.warn("[ai] all models failed:", failures.join(" | "));
  const busy = failures.some((f) => /high demand|overloaded|unavailable|quota|rate|429|503/i.test(f));
  throw new AppError(
    busy
      ? "Gemini is busy right now (free tier limits). Wait a minute and try again."
      : "The AI couldn't read this file right now. Try again, or upload a CSV/Excel export instead.",
  );
}
