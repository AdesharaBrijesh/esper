/**
 * Rule-based categorisation for imported bank statement rows. No AI/API calls —
 * pure keyword matching against the user's own category names plus a built-in
 * dictionary of common merchant/service keywords, so it works free and offline.
 *
 * Matching is deliberately simple and inspectable: first keyword hit wins. Anyone
 * can read `KEYWORD_RULES` and know exactly why a row got the category it did.
 */
import type { CategoryDTO } from "@/lib/types";

export type MatchConfidence = "matched" | "guessed" | "unmatched";

export interface CategorySuggestion {
  categoryId: string | null;
  categoryName: string | null;
  confidence: MatchConfidence;
}

/** category name -> keywords that suggest it. Matched case-insensitively as substrings. */
const KEYWORD_RULES: { category: string; keywords: string[] }[] = [
  {
    category: "Food",
    keywords: [
      "swiggy", "zomato", "dominos", "domino's", "mcdonald", "kfc", "pizza", "starbucks",
      "restaurant", "cafe", "eatery", "food", "dineout", "bigbasket", "blinkit", "zepto", "grofers",
    ],
  },
  {
    category: "Travel",
    keywords: [
      "uber", "ola ", "olacabs", "rapido", "irctc", "railway", "indigo", "spicejet", "air india",
      "vistara", "metro", "fuel", "petrol", "diesel", "hpcl", "bpcl", "iocl", "fastag", "toll", "cab",
    ],
  },
  {
    category: "Shopping",
    keywords: ["amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "reliance digital", "croma", "decathlon"],
  },
  {
    category: "Entertainment",
    keywords: [
      "netflix", "spotify", "prime video", "hotstar", "sonyliv", "bookmyshow", "pvr", "inox",
      "youtube premium", "gaming", "steam", "playstation",
    ],
  },
  {
    category: "Bills",
    keywords: [
      "electricity", "bescom", "mseb", "tneb", "broadband", "airtel", "jio", "vodafone", "vi ", "bsnl",
      "recharge", "gas bill", "water bill", "dth", "tata sky", "wifi",
    ],
  },
  {
    category: "Health",
    keywords: ["pharmacy", "apollo", "hospital", "clinic", "medical", "diagnost", "medplus", "practo", "insurance premium"],
  },
  {
    category: "Education",
    keywords: ["school fee", "college fee", "university", "tuition", "udemy", "coursera", "byju", "unacademy"],
  },
  {
    category: "Family",
    keywords: ["daycare", "creche"],
  },
  {
    category: "Gifts",
    keywords: ["gift", "ferns n petals", "archies"],
  },
  { category: "Salary", keywords: ["salary", "payroll", "sal credit", "sal-credit"] },
  { category: "Allowance", keywords: ["allowance", "stipend"] },
  { category: "Refund", keywords: ["refund", "reversal", "cashback"] },
  { category: "Other Income", keywords: ["interest credit", "dividend", "cashback"] },
];

/**
 * Suggests a category for a description, preferring the user's own categories
 * (matched by name against the keyword dictionary) so custom category names
 * still work as long as they follow common naming.
 */
export function suggestCategory(
  description: string,
  isExpense: boolean,
  categories: readonly CategoryDTO[],
): CategorySuggestion {
  const wanted = isExpense ? "EXPENSE" : "INCOME";
  const byName = new Map(
    categories.filter((c) => c.isActive && c.type === wanted).map((c) => [c.name.toLowerCase(), c] as const),
  );
  const text = description.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    const cat = byName.get(rule.category.toLowerCase());
    if (!cat) continue;
    if (rule.keywords.some((k) => text.includes(k))) {
      return { categoryId: cat.id, categoryName: cat.name, confidence: "matched" };
    }
  }

  const fallbackName = wanted === "EXPENSE" ? "Miscellaneous" : "Other Income";
  const fallback = byName.get(fallbackName.toLowerCase());
  if (fallback) return { categoryId: fallback.id, categoryName: fallback.name, confidence: "guessed" };

  return { categoryId: null, categoryName: null, confidence: "unmatched" };
}
