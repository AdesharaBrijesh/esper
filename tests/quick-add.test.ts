import { describe, expect, it } from "vitest";
import { buildAccountAliases, parseQuickEntry, parseQuickText, splitQuickEntries } from "@/lib/calculations/quick-add";
import { buildLearnedHints, suggestCategory } from "@/lib/calculations/categorize";
import type { CategoryDTO } from "@/lib/types";

describe("splitQuickEntries", () => {
  it("splits on lines, semicolons and commas between entries", () => {
    expect(splitQuickEntries("50 burger\n30 auto; 45 bus, 20 tea")).toEqual(["50 burger", "30 auto", "45 bus", "20 tea"]);
  });
  it("keeps thousands separators inside an amount", () => {
    expect(splitQuickEntries("1,200 rent\n2,50,000 laptop")).toEqual(["1,200 rent", "2,50,000 laptop"]);
  });
  it("drops blank lines and handles CRLF", () => {
    expect(splitQuickEntries("50 burger\r\n\r\n  \n30 auto\r\n")).toEqual(["50 burger", "30 auto"]);
  });
});

describe("parseQuickEntry", () => {
  it("reads the user's own example lines", () => {
    const lines = parseQuickText("50 burger\n30 auto\n45 bus");
    expect(lines.map((l) => [l.amount, l.description, l.account.kind])).toEqual([
      ["50.00", "burger", "cash"],
      ["30.00", "auto", "cash"],
      ["45.00", "bus", "cash"],
    ]);
  });

  it("bob / online / upi mean the online account, anywhere on the line", () => {
    for (const word of ["bob", "online", "upi", "BOB", "gpay", "phonepe"]) {
      const l = parseQuickEntry(`50 burger ${word}`, 0);
      expect(l.account).toEqual({ kind: "online" });
      expect(l.description).toBe("burger");
    }
    expect(parseQuickEntry("upi 50 burger", 0).description).toBe("burger");
  });

  it("drops connector words before the payment word", () => {
    const l = parseQuickEntry("120 groceries paid via upi", 0);
    expect(l.description).toBe("groceries");
    expect(l.account.kind).toBe("online");
    expect(parseQuickEntry("80 lunch by cash", 0)).toMatchObject({ description: "lunch", account: { kind: "cash" } });
  });

  it("accepts the usual ways of writing an amount", () => {
    expect(parseQuickEntry("₹50 burger", 0).amount).toBe("50.00");
    expect(parseQuickEntry("₹ 50 burger", 0).amount).toBe("50.00");
    expect(parseQuickEntry("rs 50 burger", 0).amount).toBe("50.00");
    expect(parseQuickEntry("50rs burger", 0).amount).toBe("50.00");
    expect(parseQuickEntry("50 rs burger", 0)).toMatchObject({ amount: "50.00", description: "burger" });
    expect(parseQuickEntry("50/- burger", 0).amount).toBe("50.00");
    expect(parseQuickEntry("1,200 rent", 0).amount).toBe("1200.00");
    expect(parseQuickEntry("49.5 juice", 0).amount).toBe("49.50");
    expect(parseQuickEntry("2k shoes", 0).amount).toBe("2000.00");
  });

  it("takes a trailing amount when the line doesn't start with one", () => {
    expect(parseQuickEntry("burger 50", 0)).toMatchObject({ amount: "50.00", description: "burger" });
    expect(parseQuickEntry("auto to station - 40 online", 0)).toMatchObject({ amount: "40.00", description: "auto to station", account: { kind: "online" } });
  });

  it("prefers the leading number so quantities in the text stay text", () => {
    expect(parseQuickEntry("60 2 samosa", 0)).toMatchObject({ amount: "60.00", description: "2 samosa" });
  });

  it("flags a line without an amount instead of guessing", () => {
    const l = parseQuickEntry("burger", 0);
    expect(l.amount).toBeNull();
    expect(l.error).toMatch(/amount/i);
  });

  it("matches one of the user's own account names", () => {
    const aliases = buildAccountAliases([
      { id: "a-hdfc", name: "HDFC Bank", institution: "HDFC" },
      { id: "a-cash", name: "Self Cash", institution: null },
      { id: "a-card", name: "Amazon Pay Card", institution: "ICICI" },
    ]);
    expect(parseQuickEntry("500 shoes hdfc", 0, aliases)).toMatchObject({ account: { kind: "account", accountId: "a-hdfc" }, description: "shoes" });
    expect(parseQuickEntry("500 shoes icici", 0, aliases).account).toEqual({ kind: "account", accountId: "a-card" });
    // Built-in words keep their meaning even when an account name contains them.
    expect(parseQuickEntry("50 tea cash", 0, aliases).account).toEqual({ kind: "cash" });
  });
});

describe("buildAccountAliases", () => {
  it("skips generic words and words shared by two accounts", () => {
    const aliases = buildAccountAliases([
      { id: "1", name: "Self Bank", institution: "SBI" },
      { id: "2", name: "Brother Bank", institution: "SBI" },
    ]);
    const words = aliases.map((a) => a.word);
    expect(words).not.toContain("bank");
    expect(words).not.toContain("self");
    expect(words).not.toContain("sbi");
    expect(words).toContain("self bank");
  });
});

describe("suggestCategory for quick add", () => {
  const cats: CategoryDTO[] = [
    { id: "food", name: "Food", type: "EXPENSE", icon: "🍔", color: null, isActive: true, sortOrder: 0 },
    { id: "travel", name: "Travel", type: "EXPENSE", icon: "🚌", color: null, isActive: true, sortOrder: 1 },
    { id: "bills", name: "Bills", type: "EXPENSE", icon: "🧾", color: null, isActive: true, sortOrder: 2 },
    { id: "misc", name: "Miscellaneous", type: "EXPENSE", icon: "📦", color: null, isActive: true, sortOrder: 3 },
    { id: "health", name: "Health", type: "EXPENSE", icon: "💊", color: null, isActive: true, sortOrder: 4 },
  ];
  const cat = (text: string) => suggestCategory(text, true, cats).categoryId;

  it("files everyday spends", () => {
    expect(cat("burger")).toBe("food");
    expect(cat("chai")).toBe("food");
    expect(cat("vada pav")).toBe("food");
    expect(cat("auto")).toBe("travel");
    expect(cat("bus")).toBe("travel");
    expect(cat("petrol")).toBe("travel");
    expect(cat("medicines")).toBe("health");
  });

  it("matches whole words, not fragments", () => {
    expect(cat("business lunch")).toBe("food"); // "lunch", never "bus"
    expect(cat("automobile magazine")).toBe("misc");
    expect(cat("team outing")).toBe("misc"); // not "tea"
  });

  it("lets the longest keyword win", () => {
    expect(cat("water bill")).toBe("bills");
    expect(cat("uber eats")).toBe("food");
    expect(cat("uber")).toBe("travel");
  });

  it("falls back to Miscellaneous when nothing matches", () => {
    expect(suggestCategory("haircut", true, cats)).toMatchObject({ categoryId: "misc", confidence: "guessed" });
  });

  it("learns from what the user filed before", () => {
    const learned = buildLearnedHints([
      { notes: "Haircut", categoryId: "health" },
      { notes: "Raju's dhaba", categoryId: "food" },
      { notes: "Raju's dhaba dinner", categoryId: "food" },
    ]);
    expect(suggestCategory("haircut", true, cats, learned).categoryId).toBe("health");
    // Single word, seen twice under one category.
    expect(suggestCategory("dhaba", true, cats, learned).categoryId).toBe("food");
    // An exact past phrase beats the keyword dictionary.
    const override = buildLearnedHints([{ notes: "auto", categoryId: "bills" }]);
    expect(suggestCategory("auto", true, cats, override).categoryId).toBe("bills");
  });

  it("ignores learned ids that are not active expense categories", () => {
    const learned = buildLearnedHints([{ notes: "haircut", categoryId: "deleted-category" }]);
    expect(suggestCategory("haircut", true, cats, learned).categoryId).toBe("misc");
  });
});
