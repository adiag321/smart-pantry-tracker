import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { matchProducts } from "@/lib/inventory/matchProducts";
import { getAvailableQuantity } from "@/lib/inventory/availability";

type Recipe = Database["public"]["Tables"]["recipes"]["Row"];
type RecipeIngredient = Database["public"]["Tables"]["recipe_ingredients"]["Row"];

export type MissingIngredient = {
  ingredient: string;
  required: number;
  available: number;
  unit: string | null;
};

export type RecipeMatch = {
  recipe: Recipe;
  missing: MissingIngredient[];
};

// Reverse-match (PRD section 3H): for each stored recipe, sum available
// quantity_remaining (converted to the recipe's unit) across every matching
// product, same matching/conversion logic the cook and shopping-list routes
// use. An ingredient with no product match at all is still "missing" - it
// just can't report an available quantity.
async function missingForRecipe(
  supabase: SupabaseClient<Database>,
  ingredients: RecipeIngredient[],
): Promise<MissingIngredient[]> {
  const missing: MissingIngredient[] = [];

  for (const ingredient of ingredients) {
    const products = await matchProducts(supabase, ingredient.standardized_name);
    const available =
      products.length > 0
        ? await getAvailableQuantity(
            supabase,
            products.map((p) => p.id),
            ingredient.unit,
          )
        : 0;

    if (available < ingredient.required_quantity) {
      missing.push({
        ingredient: ingredient.standardized_name,
        required: ingredient.required_quantity,
        available,
        unit: ingredient.unit,
      });
    }
  }

  return missing;
}

// "Ready to cook" = every ingredient already covered; "almost there" =
// missing only 1-2 ingredients (PRD section 3H's own threshold).
export async function findReadyToCook(
  supabase: SupabaseClient<Database>,
): Promise<{ ready: RecipeMatch[]; almost: RecipeMatch[] }> {
  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .order("title");

  if (error) throw new Error(error.message);

  const ready: RecipeMatch[] = [];
  const almost: RecipeMatch[] = [];

  for (const recipe of recipes) {
    const { recipe_ingredients, ...recipeRow } = recipe;
    const missing = await missingForRecipe(supabase, recipe_ingredients);

    if (missing.length === 0) {
      ready.push({ recipe: recipeRow, missing });
    } else if (missing.length <= 2) {
      almost.push({ recipe: recipeRow, missing });
    }
  }

  return { ready, almost };
}
