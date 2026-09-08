/**
 * Returns a same-origin path ("/foo?x=1") or the fallback. Rejects protocol-relative
 * and backslash tricks like "//evil.com" or "/\evil.com" that browsers resolve off-site.
 * Safe for client and server code.
 */
export function safePath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value === "" || !value.startsWith("/")) return fallback;
  try {
    const url = new URL(value, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    if (url.pathname.startsWith("/login")) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
