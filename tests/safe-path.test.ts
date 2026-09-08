import { describe, expect, it } from "vitest";
import { safePath } from "@/lib/safe-path";

describe("safePath", () => {
  it("keeps same-origin paths with query strings", () => {
    expect(safePath("/transactions?page=2")).toBe("/transactions?page=2");
    expect(safePath("/loans/abc")).toBe("/loans/abc");
  });

  it("falls back for external, protocol-relative and backslash tricks", () => {
    expect(safePath("https://evil.com")).toBe("/");
    expect(safePath("//evil.com")).toBe("/");
    expect(safePath("/\\evil.com")).toBe("/");
    expect(safePath("/\\\\evil.com/x")).toBe("/");
    expect(safePath("javascript:alert(1)")).toBe("/");
  });

  it("falls back for empty, non-string and login paths", () => {
    expect(safePath("")).toBe("/");
    expect(safePath(undefined, "/x")).toBe("/x");
    expect(safePath(["/a"], "/x")).toBe("/x");
    expect(safePath("/login?next=/", "/x")).toBe("/x");
  });
});
