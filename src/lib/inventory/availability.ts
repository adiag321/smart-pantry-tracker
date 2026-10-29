import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { convertQuantity } from "@/lib/units/convert";

// Sums `quantity_remaining` across every batch of every given product,
// converting each batch's unit into `targetUnit`. A batch whose unit can't
// be converted to the target (e.g. stored in "clove" but the recipe wants
// "cup") is skipped rather than guessed at - PRD section 3I's shortfall
// math would rather under-count availability (and show an extra shopping
// list item) than silently over-count it.
export async function getAvailableQuantity(
  supabase: SupabaseClient<Database>,
  productIds: string[],
  targetUnit: string | null,
): Promise<number> {
  if (productIds.length === 0) return 0;

  const { data, error } = await supabase
    .from("inventory_batches")
    .select("quantity_remaining, unit")
    .in("product_id", productIds)
    .gt("quantity_remaining", 0);

  if (error) throw new Error(error.message);

  return data.reduce((total, batch) => {
    const converted = convertQuantity(batch.quantity_remaining, batch.unit, targetUnit);
    return total + (converted ?? 0);
  }, 0);
}
