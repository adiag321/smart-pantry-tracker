import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchProducts } from "@/lib/inventory/matchProducts";
import { convertQuantity } from "@/lib/units/convert";

type IngredientResult = {
  ingredient: string;
  status: "deducted" | "no_product_match" | "no_inventory" | "unit_mismatch" | "insufficient";
  detail?: string;
};

// Deducts each recipe ingredient from pantry inventory (PRD section 3D) by
// delegating to the `deduct_inventory_fifo` Postgres function for the
// actual oldest-batch-first math - this route's job is only to resolve
// "which product does this ingredient name refer to" and "what quantity,
// in that product's inventory unit" before calling it.
//
// Each ingredient is deducted independently; one ingredient failing (no
// matching product, insufficient stock, ...) doesn't block the others -
// the response reports per-ingredient status so the UI can show exactly
// what happened rather than an all-or-nothing error.
export async function POST(
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
  if (!ingredients || ingredients.length === 0) {
    return NextResponse.json({ error: "Recipe has no ingredients" }, { status: 404 });
  }

  const results: IngredientResult[] = [];

  for (const ingredient of ingredients) {
    const products = await matchProducts(supabase, ingredient.standardized_name);
    if (products.length === 0) {
      results.push({
        ingredient: ingredient.standardized_name,
        status: "no_product_match",
      });
      continue;
    }

    const productIds = products.map((p) => p.id);
    const { data: batches, error: batchesError } = await supabase
      .from("inventory_batches")
      .select("product_id, unit, quantity_remaining")
      .in("product_id", productIds)
      .gt("quantity_remaining", 0);

    if (batchesError) {
      results.push({
        ingredient: ingredient.standardized_name,
        status: "no_inventory",
        detail: batchesError.message,
      });
      continue;
    }
    if (!batches || batches.length === 0) {
      results.push({ ingredient: ingredient.standardized_name, status: "no_inventory" });
      continue;
    }

    // Pick the matched product with the most total stock - the one most
    // likely to actually satisfy the requirement.
    const totalsByProduct = new Map<string, number>();
    for (const b of batches) {
      totalsByProduct.set(b.product_id, (totalsByProduct.get(b.product_id) ?? 0) + b.quantity_remaining);
    }
    const bestProductId = [...totalsByProduct.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const representativeUnit = batches.find((b) => b.product_id === bestProductId)!.unit;

    const convertedAmount = convertQuantity(
      ingredient.required_quantity,
      ingredient.unit,
      representativeUnit,
    );
    if (convertedAmount === null) {
      results.push({
        ingredient: ingredient.standardized_name,
        status: "unit_mismatch",
        detail: `Can't convert ${ingredient.unit || "count"} to ${representativeUnit}`,
      });
      continue;
    }

    const { error: deductError } = await supabase.rpc("deduct_inventory_fifo", {
      p_product_id: bestProductId,
      p_amount: convertedAmount,
    });

    if (deductError) {
      results.push({
        ingredient: ingredient.standardized_name,
        status: "insufficient",
        detail: deductError.message,
      });
      continue;
    }

    results.push({ ingredient: ingredient.standardized_name, status: "deducted" });
  }

  return NextResponse.json({ results });
}
