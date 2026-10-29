import type { ParsedIngredient } from "./types";

const UNITS = [
  "cups?",
  "tablespoons?",
  "tbsp",
  "teaspoons?",
  "tsp",
  "ounces?",
  "oz",
  "pounds?",
  "lbs?",
  "grams?",
  "g",
  "kilograms?",
  "kg",
  "milliliters?",
  "ml",
  "liters?",
  "l",
  "pinch(?:es)?",
  "cloves?",
  "slices?",
  "cans?",
  "packages?",
  "sticks?",
  "heads?",
];
const UNIT_PATTERN = new RegExp(`^(${UNITS.join("|")})\\b\\.?`, "i");

// Matches a leading quantity: "2", "2.5", "1/2", "1 1/2", "½" (unicode fraction).
const QUANTITY_PATTERN = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+|[½⅓⅔¼¾⅛])\s*/;

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
};

function parseQuantity(raw: string): number {
  if (raw in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[raw];
  if (raw.includes(" ")) {
    const [whole, frac] = raw.split(" ");
    return Number(whole) + parseQuantity(frac);
  }
  if (raw.includes("/")) {
    const [num, denom] = raw.split("/");
    return Number(num) / Number(denom);
  }
  return Number(raw);
}

// Best-effort parser for free-text ingredient lines (e.g. "2 cups whole milk").
// Used both for schema.org `recipeIngredient` strings and the Readability
// fallback's unstructured text - neither is guaranteed to parse cleanly, so
// this always returns a result with `name` as a safe fallback rather than
// throwing, even if amount/unit end up null.
export function parseIngredientLine(line: string): ParsedIngredient {
  let rest = line.trim();
  let amount: number | null = null;
  let unit: string | null = null;

  const qtyMatch = rest.match(QUANTITY_PATTERN);
  if (qtyMatch) {
    amount = parseQuantity(qtyMatch[1]);
    rest = rest.slice(qtyMatch[0].length);
  }

  const unitMatch = rest.match(UNIT_PATTERN);
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    rest = rest.slice(unitMatch[0].length).trim();
  }

  const name = (rest || line.trim()).replace(/\s+/g, " ");
  return { name, amount, unit };
}
