/**
 * Rule-based categorisation, shared by statement imports and quick add. No AI/API
 * calls — keyword matching against the user's own category names plus a built-in
 * dictionary of common merchants and everyday spends, so it works free and offline.
 *
 * Order of evidence, strongest first:
 *  1. What the user themselves filed the same description under before ("learned").
 *  2. The longest dictionary keyword found in the text ("water bill" beats "water").
 *  3. A single word the user has consistently filed under one category before.
 *  4. Miscellaneous / Other Income.
 *
 * Keywords match on word starts, so "bus" never fires inside "business"; short keywords
 * (4 letters or fewer) must also end on a word boundary, optionally with a plural "s".
 */
import type { CategoryDTO } from "@/lib/types";

export type MatchConfidence = "matched" | "guessed" | "unmatched";

export interface CategorySuggestion {
  categoryId: string | null;
  categoryName: string | null;
  confidence: MatchConfidence;
}

/**
 * Categories a user has already used for a description, built from their own history
 * (see getLearnedCategoryHints). Keys are normalizeDescription() output.
 */
export interface LearnedHints {
  phrases: Record<string, string>;
  words: Record<string, string>;
}

/** category name -> keywords that suggest it. */
const KEYWORD_RULES: { category: string; keywords: string[] }[] = [
  {
    category: "Food",
    keywords: [
      "swiggy", "zomato", "dominos", "domino's", "mcdonald", "kfc", "pizza", "starbucks", "restaurant", "cafe",
      "eatery", "food", "dineout", "bigbasket", "blinkit", "zepto", "instamart", "grofers", "dmart", "burger",
      "sandwich", "chai", "tea", "coffee", "snack", "lunch", "dinner", "breakfast", "juice", "maggi", "samosa",
      "vada pav", "vadapav", "pav bhaji", "momos", "biryani", "thali", "dosa", "idli", "paratha", "pani puri",
      "panipuri", "chaat", "ice cream", "icecream", "lassi", "sweets", "mithai", "bakery", "cake", "chocolate",
      "biscuit", "chips", "milk", "curd", "paneer", "egg", "fruit", "vegetable", "veggies", "sabzi", "grocery",
      "groceries", "kirana", "canteen", "mess", "tiffin", "noodles", "pasta", "shawarma", "frankie", "roll",
      "cold drink", "coke", "pepsi", "soda", "dabeli", "kachori", "poha", "bread", "meal", "eat", "uber eats",
    ],
  },
  {
    category: "Travel",
    keywords: [
      "uber", "ola", "olacabs", "rapido", "irctc", "railway", "train", "indigo", "spicejet", "air india",
      "vistara", "akasa", "metro", "fuel", "petrol", "diesel", "cng", "hpcl", "bpcl", "iocl", "fastag", "toll",
      "cab", "taxi", "auto", "rickshaw", "bus", "parking", "flight", "redbus", "makemytrip", "goibibo",
      "bus pass", "local train", "travel",
    ],
  },
  {
    category: "Shopping",
    keywords: [
      "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "reliance digital", "croma", "decathlon",
      "clothes", "shirt", "tshirt", "t-shirt", "jeans", "shoes", "shoe", "slipper", "watch", "dress", "kurta",
      "jacket", "earphone", "charger", "cable", "mobile cover", "shopping",
    ],
  },
  {
    category: "Entertainment",
    keywords: [
      "netflix", "spotify", "prime video", "hotstar", "jiohotstar", "sonyliv", "bookmyshow", "pvr", "inox",
      "youtube premium", "gaming", "steam", "playstation", "movie", "cinema", "concert", "bowling", "movie ticket",
    ],
  },
  {
    category: "Bills",
    keywords: [
      "electricity", "bescom", "mseb", "tneb", "torrent power", "broadband", "airtel", "jio", "vodafone", "vi",
      "bsnl", "recharge", "gas bill", "water bill", "dth", "tata sky", "wifi", "rent", "maintenance",
      "gas cylinder", "lpg", "bill",
    ],
  },
  {
    category: "Health",
    keywords: [
      "pharmacy", "apollo", "hospital", "clinic", "medical", "medicine", "tablet", "doctor", "diagnost",
      "medplus", "practo", "insurance premium", "netmeds", "pharmeasy", "1mg", "dentist", "checkup", "gym",
    ],
  },
  {
    category: "Education",
    keywords: [
      "school fee", "college fee", "university", "tuition", "udemy", "coursera", "byju", "unacademy", "book",
      "stationery", "notebook", "xerox", "photocopy", "printout", "course", "exam fee",
    ],
  },
  { category: "Family", keywords: ["daycare", "creche"] },
  { category: "Gifts", keywords: ["gift", "ferns n petals", "archies"] },
  { category: "Salary", keywords: ["salary", "payroll", "sal credit", "sal-credit"] },
  { category: "Allowance", keywords: ["allowance", "stipend", "pocket money"] },
  { category: "Refund", keywords: ["refund", "reversal", "cashback"] },
  { category: "Other Income", keywords: ["interest credit", "dividend"] },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compiled once: one regex per keyword. */
const COMPILED = KEYWORD_RULES.map((rule) => ({
  category: rule.category.toLowerCase(),
  matchers: rule.keywords.map((k) => {
    const body = escapeRe(k.toLowerCase()).replace(/\\? /g, "[\\s._/-]*");
    const end = k.length <= 4 ? "s?(?![a-z0-9])" : "";
    return { length: k.length, re: new RegExp(`(?:^|[^a-z0-9])${body}${end}`) };
  }),
}));

/** Lowercase words only, so "Burger!!" and "burger" are the same key. */
export function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function byNameFor(categories: readonly CategoryDTO[], wanted: "EXPENSE" | "INCOME") {
  return new Map(
    categories.filter((c) => c.isActive && c.type === wanted).map((c) => [c.name.toLowerCase(), c] as const),
  );
}

/**
 * Suggests a category for a description, preferring the user's own categories
 * (matched by name against the keyword dictionary) so custom category names
 * still work as long as they follow common naming.
 */
export function suggestCategory(
  description: string,
  isExpense: boolean,
  categories: readonly CategoryDTO[],
  learned?: LearnedHints,
): CategorySuggestion {
  const wanted = isExpense ? "EXPENSE" : "INCOME";
  const byName = byNameFor(categories, wanted);
  const byId = new Map(categories.filter((c) => c.isActive && c.type === wanted).map((c) => [c.id, c] as const));
  const text = description.toLowerCase();
  const normalized = normalizeDescription(description);

  // 1. Exactly what the user filed this description under before.
  const learnedPhrase = normalized && learned ? byId.get(learned.phrases[normalized] ?? "") : undefined;
  if (learnedPhrase) return { categoryId: learnedPhrase.id, categoryName: learnedPhrase.name, confidence: "matched" };

  // 2. The longest dictionary keyword present wins.
  let best: { cat: CategoryDTO; length: number } | null = null;
  for (const rule of COMPILED) {
    const cat = byName.get(rule.category);
    if (!cat) continue;
    for (const m of rule.matchers) {
      if (m.length > (best?.length ?? 0) && m.re.test(text)) best = { cat, length: m.length };
    }
  }
  if (best) return { categoryId: best.cat.id, categoryName: best.cat.name, confidence: "matched" };

  // 3. A word the user consistently files under one category.
  if (learned && normalized) {
    for (const word of normalized.split(" ")) {
      const cat = byId.get(learned.words[word] ?? "");
      if (cat) return { categoryId: cat.id, categoryName: cat.name, confidence: "matched" };
    }
  }

  const fallbackName = wanted === "EXPENSE" ? "Miscellaneous" : "Other Income";
  const fallback = byName.get(fallbackName.toLowerCase());
  if (fallback) return { categoryId: fallback.id, categoryName: fallback.name, confidence: "guessed" };

  return { categoryId: null, categoryName: null, confidence: "unmatched" };
}

/** Words that say nothing about what something was. Never learned from on their own. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "to", "at", "of", "in", "on", "a", "an", "my", "me", "paid", "pay", "payment",
  "upi", "online", "cash", "bob", "via", "by", "transfer", "txn", "ref", "to", "rs", "inr",
]);

/**
 * Turns (description, categoryId) history into LearnedHints. A phrase maps to the
 * category it was used with most; a single word is only learned when it was seen at
 * least twice and always (≥ 80%) under the same category.
 */
export function buildLearnedHints(history: Iterable<{ notes: string | null; categoryId: string | null }>): LearnedHints {
  const phraseCounts = new Map<string, Map<string, number>>();
  const wordCounts = new Map<string, Map<string, number>>();
  const bump = (m: Map<string, Map<string, number>>, key: string, cat: string) => {
    const inner = m.get(key) ?? new Map<string, number>();
    inner.set(cat, (inner.get(cat) ?? 0) + 1);
    m.set(key, inner);
  };
  for (const h of history) {
    if (!h.notes || !h.categoryId) continue;
    const phrase = normalizeDescription(h.notes);
    if (!phrase || phrase.length > 60) continue;
    bump(phraseCounts, phrase, h.categoryId);
    for (const w of new Set(phrase.split(" "))) {
      if (w.length >= 3 && !STOP_WORDS.has(w)) bump(wordCounts, w, h.categoryId);
    }
  }
  const phrases: Record<string, string> = {};
  for (const [phrase, counts] of phraseCounts) {
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    phrases[phrase] = top[0];
  }
  const words: Record<string, string> = {};
  for (const [word, counts] of wordCounts) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (total >= 2 && top[1] / total >= 0.8) words[word] = top[0];
  }
  return { phrases, words };
}
