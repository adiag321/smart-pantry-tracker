import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupUpc } from "@/lib/barcode/lookupUpc";

// Barcode-based pantry logging (PRD section 3F). A scanned UPC is checked
// against our own `products` first - if we've already logged this barcode
// there's already-known store/price/aisle data worth reusing - then falls
// back to Open Food Facts for a product name when it's genuinely new.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ upc: string }> },
) {
  const { upc } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", upc)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ upc, source: "products", product: existing });
  }

  const offResult = await lookupUpc(upc);
  if (offResult) {
    return NextResponse.json({ upc, source: "openfoodfacts", ...offResult });
  }

  return NextResponse.json({ upc, source: "none" }, { status: 404 });
}
