import convert from "convert-units";

// Maps the free-text unit strings produced by recipe parsing
// (parseIngredientLine.ts / LLM extraction - "cups", "tbsp", "cloves", a
// bare count with no unit, ...) onto convert-units' abbreviations. Units
// convert-units doesn't know about (grocery-specific: clove, slice, can,
// package, head, pinch, stick) fall through to custom handling below.
const UNIT_ALIASES: Record<string, convert.Mass | convert.Volume> = {
  cup: "cup",
  cups: "cup",
  tablespoon: "Tbs",
  tablespoons: "Tbs",
  tbsp: "Tbs",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  gram: "g",
  grams: "g",
  g: "g",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  milliliter: "ml",
  milliliters: "ml",
  ml: "ml",
  liter: "l",
  liters: "l",
  l: "l",
};

// No natural unit (a bare "2 eggs") is treated as a plain count, kept
// separate from convert-units entirely - the installed version supports an
// "ea"/"dz" quantity measure at runtime, but @types/convert-units doesn't
// declare it, and hand-rolling 1 dz = 12 ea is simpler than fighting the
// type mismatch.
const COUNT_UNITS = new Set(["", "count", "each", "ea"]);
const DOZEN_UNITS = new Set(["dozen", "dz"]);

// Grocery units with no universal physical conversion (a "clove" of garlic
// isn't a fixed volume/mass) are only combinable with themselves - this is
// a deliberately conservative default. "stick" is the one exception common
// enough in US recipes (butter) to warrant a fixed anchor into grams.
const NON_CONVERTIBLE_UNITS = new Set([
  "pinch",
  "pinches",
  "clove",
  "cloves",
  "slice",
  "slices",
  "can",
  "cans",
  "package",
  "packages",
  "head",
  "heads",
]);

// 1 US butter stick ≈ 8 Tbs by volume convention and ≈113g by weight -
// these are independent fixed culinary equivalences (not derived from one
// another via density), so each needs its own anchor.
const STICK_TO_TBS = 8;
const STICK_TO_GRAMS = 113;

function normalize(unit: string | null | undefined): string {
  return (unit ?? "").trim().toLowerCase();
}

/**
 * Converts `amount` of `fromUnit` into `toUnit`. Returns null when the
 * conversion isn't possible (incompatible measures, e.g. volume -> mass, or
 * an unmapped grocery-specific unit) rather than throwing - callers treat
 * null as "can't verify, don't double-count."
 */
export function convertQuantity(
  amount: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
): number | null {
  const from = normalize(fromUnit);
  const to = normalize(toUnit);

  if (from === to) return amount;

  const fromIsCount = COUNT_UNITS.has(from);
  const fromIsDozen = DOZEN_UNITS.has(from);
  const toIsCount = COUNT_UNITS.has(to);
  const toIsDozen = DOZEN_UNITS.has(to);
  if ((fromIsCount || fromIsDozen) && (toIsCount || toIsDozen)) {
    if (fromIsDozen && toIsCount) return amount * 12;
    if (fromIsCount && toIsDozen) return amount / 12;
    return amount;
  }

  if (from === "stick") {
    const viaVolume = convertQuantity(amount * STICK_TO_TBS, "tablespoon", toUnit);
    if (viaVolume !== null) return viaVolume;
    return convertQuantity(amount * STICK_TO_GRAMS, "gram", toUnit);
  }
  if (to === "stick") {
    const viaVolume = convertQuantity(amount, fromUnit, "tablespoon");
    if (viaVolume !== null) return viaVolume / STICK_TO_TBS;
    const grams = convertQuantity(amount, fromUnit, "gram");
    return grams === null ? null : grams / STICK_TO_GRAMS;
  }

  if (NON_CONVERTIBLE_UNITS.has(from) || NON_CONVERTIBLE_UNITS.has(to)) {
    return null;
  }

  const fromAlias = UNIT_ALIASES[from];
  const toAlias = UNIT_ALIASES[to];
  if (!fromAlias || !toAlias) return null;

  try {
    return convert(amount).from(fromAlias).to(toAlias);
  } catch {
    return null;
  }
}
