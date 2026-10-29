import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Logging a purchase (PRD section 3C/3F) - adds a new inventory_batches row.
// This is the only write path into inventory_batches outside of
// deduct_inventory_fifo(); fed either by the barcode-scan flow (section 3F,
// productId resolved from a barcode match) or manual entry (name+store,
// upserted the same way /api/products does).
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { productId, name, store, barcode, quantity, unit, purchaseDate, expiryDate } = body;

  if (!quantity || quantity <= 0 || !unit) {
    return NextResponse.json(
      { error: "quantity (> 0) and unit are required" },
      { status: 400 },
    );
  }
  if (!productId && (!name || !store)) {
    return NextResponse.json(
      { error: "either productId, or name and store, are required" },
      { status: 400 },
    );
  }
  if (store && store !== "Walmart" && store !== "HEB") {
    return NextResponse.json(
      { error: "store must be 'Walmart' or 'HEB'" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  let resolvedProductId = productId;
  if (!resolvedProductId) {
    // Omit `barcode` entirely unless given - upserting `barcode: null` would
    // silently clear an existing barcode on a product re-entered by hand.
    const { data: product, error: upsertError } = await supabase
      .from("products")
      .upsert(
        {
          name,
          store,
          last_updated: new Date().toISOString(),
          ...(barcode ? { barcode } : {}),
        },
        { onConflict: "name,store", ignoreDuplicates: false },
      )
      .select()
      .single();

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
    resolvedProductId = product.id;
  }

  const { data: batch, error: batchError } = await supabase
    .from("inventory_batches")
    .insert({
      product_id: resolvedProductId,
      quantity_remaining: quantity,
      unit,
      purchase_date: purchaseDate ?? new Date().toISOString(),
      expiry_date: expiryDate ?? null,
    })
    .select()
    .single();

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  return NextResponse.json({ batch });
}
