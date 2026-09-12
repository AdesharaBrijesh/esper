import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { verifySessionToken } from "@/lib/auth/jwt";
import { cspMode } from "@/lib/env";

/**
 * Optimistic route protection (runs before rendering, no DB access) plus the
 * security headers for every HTML response.
 *
 * Real authorization happens in lib/auth/dal.ts and inside every server action.
 */
const PUBLIC_PATHS = ["/login", "/offline", "/manifest.webmanifest", "/sw.js"];
const PUBLIC_PREFIXES = ["/api/health", "/icons/", "/_next/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Content-Security-Policy.
 *
 * Scripts are nonce-locked with 'strict-dynamic' — that is the directive that actually
 * stops injected script from running. Styles keep 'unsafe-inline' on purpose: Base UI
 * positions popovers and Recharts sizes its SVG through inline style attributes, and a
 * nonce cannot cover those. Injected CSS is a far smaller problem than injected JS.
 */
function buildCsp(mode: "nonce" | "basic", nonce: string, isDev: boolean): string {
  const scriptSrc =
    mode === "nonce"
      ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Headers that apply regardless of CSP mode. */
function applyBaseSecurityHeaders(headers: Headers, isDev: boolean): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-DNS-Prefetch-Control", "off");
  // Only meaningful over HTTPS; harmless otherwise, and the LAN/plain-HTTP setup
  // documented in the README runs with NODE_ENV=production too, so keep it opt-out.
  if (!isDev && process.env.COOKIE_SECURE !== "false") {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";
  const mode = cspMode();

  const nonce = mode === "nonce" ? crypto.randomUUID().replace(/-/g, "") : "";
  const csp = mode === "off" ? null : buildCsp(mode, nonce, isDev);

  /** Every response leaves through here so the headers are never forgotten. */
  const decorate = (response: NextResponse): NextResponse => {
    applyBaseSecurityHeaders(response.headers, isDev);
    if (csp) response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  /**
   * Next reads the nonce back off the request's CSP header and stamps it onto its own
   * script tags, so the forwarded request headers must carry both values.
   */
  const forward = (): NextResponse => {
    if (mode !== "nonce") return NextResponse.next();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    if (csp) requestHeaders.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (pathname === "/login") {
    if (session) return decorate(NextResponse.redirect(new URL("/", request.nextUrl)));
    return decorate(forward());
  }

  if (isPublicPath(pathname)) {
    return decorate(forward());
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return decorate(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const loginUrl = new URL("/login", request.nextUrl);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return decorate(NextResponse.redirect(loginUrl));
  }

  return decorate(forward());
}

export const config = {
  matcher: [
    // Everything except static files, images and metadata files
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icons/|robots.txt|sw.js|manifest.webmanifest).*)",
  ],
};
