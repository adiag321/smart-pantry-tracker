import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type Product = Database["public"]["Tables"]["products"]["Row"];

// Recipe ingredient text commonly trails off into prep instructions after a
// comma or parenthetical - "butter, softened", "onion, diced",
// "flour (plus extra for dusting)" - none of which belong in a product
// name match. Strips everything from the first comma/parenthesis onward.
function coreName(ingredientName: string): string {
  return ingredientName.split(/[,(]/)[0].trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Recipe ingredients use free-text standardized names ("flour", "whole
// milk") while `products` rows are specific store listings ("H-E-B Whole
// Milk", "Great Value Milk"). There's no explicit FK between them (PRD
// doesn't define one), so matching is by case-insensitive whole-word
// containment - a pragmatic choice for a single-user app where product
// names are short and you control what's in your own products table, not a
// general-purpose NLP matcher. Plain substring matching (ILIKE %x%) was
// tried first and rejected: it matched "salt" against "Unsalted Butter"
// (the "salt" inside "unSALTed"), silently deducting the wrong product's
// inventory - `\y` word-boundary regex avoids that class of false positive.
export async function matchProducts(
  supabase: SupabaseClient<Database>,
  ingredientName: string,
): Promise<Product[]> {
  const pattern = `\\y${escapeRegex(coreName(ingredientName))}\\y`;
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .filter("name", "imatch", pattern);

  if (error) throw new Error(error.message);
  return data;
}
