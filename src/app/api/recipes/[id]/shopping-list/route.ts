import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchProducts, type Product } from "@/lib/inventory/matchProducts";
import { getAvailableQuantity } from "@/lib/inventory/availability";

type ShoppingListItem = {
  ingredient: string;
  neededQuantity: number;
  unit: string | null;
  store: "Walmart" | "HEB" | null;
  aisle: string | null;
  price: number | null;
};

// Picks the store listing to buy from for a shortfall ingredient: cheapest
// of the matched products (PRD section 3I, step 5). A product with no price
// recorded yet is treated as worse than any priced one (can't compare), not
// as free - sorts last.
function pickCheapest(products: Product[]): Product | null {
  const priced = products.filter((p) => p.price !== null);
  if (priced.length === 0) return products[0] ?? null;
  return priced.reduce((cheapest, p) => (p.price! < cheapest.price! ? p : cheapest));
}

// Builds the shortfall shopping list for a single recipe (PRD section 3I):
// for each ingredient, convert to a comparable unit, subtract what's
// already in pantry inventory, and only list the remainder - grouped by
// store, sorted by aisle, defaulting to the cheaper store when an
// ingredient matches products at both.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: recipeId } = await context.params;
  const supabase = createAdminClient();

  const { data: ingredients, error: ingredientsError } = await supabase
    .from("recipe_ingredients")
    .select("*")
    .eq("recipe_id", recipeId);

  if (ingredientsError) {
    return NextResponse.json({ error: ingredientsError.message }, { status: 500 });
  }
  if (!ingredients) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const items: ShoppingListItem[] = [];

  for (const ingredient of ingredients) {
    const products = await matchProducts(supabase, ingredient.standardized_name);
    const available = await getAvailableQuantity(
      supabase,
      products.map((p) => p.id),
      ingredient.unit,
    );

    const shortfall = ingredient.required_quantity - available;
    if (shortfall <= 0) continue;

    const chosen = pickCheapest(products);
    items.push({
      ingredient: ingredient.standardized_name,
      neededQuantity: shortfall,
      unit: ingredient.unit || null,
      store: chosen?.store ?? null,
      aisle: chosen?.aisle ?? null,
      price: chosen?.price ?? null,
    });
  }

  const grouped = Object.groupBy(items, (item) => item.store ?? "Unknown store");
  for (const storeItems of Object.values(grouped)) {
    storeItems?.sort((a, b) => (a.aisle ?? "").localeCompare(b.aisle ?? ""));
  }

  return NextResponse.json({ groupedByStore: grouped });
}
