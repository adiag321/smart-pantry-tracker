import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Manual price/aisle entry (PRD section 3A). Replaces the automated scraper
// pipeline: Walmart and H-E-B both block headless-browser access outright
// (confirmed via live testing - press-and-hold/Akamai bot challenges before
// any page content loads), so price data is entered by hand instead.
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("store")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ products: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, store, aisle, price } = body;

  if (!name || !store || price == null) {
    return NextResponse.json(
      { error: "name, store, and price are required" },
      { status: 400 },
    );
  }
  if (store !== "Walmart" && store !== "HEB") {
    return NextResponse.json(
      { error: "store must be 'Walmart' or 'HEB'" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: product, error: upsertError } = await supabase
    .from("products")
    .upsert(
      { name, store, aisle: aisle ?? null, price, last_updated: new Date().toISOString() },
      { onConflict: "name,store" },
    )
    .select()
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { error: historyError } = await supabase
    .from("price_history")
    .insert({ product_id: product.id, price });

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  return NextResponse.json({ product });
}
