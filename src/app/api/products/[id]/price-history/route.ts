import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Price-history sparklines (PRD section 3G). Each manual price update
// appends a price_history row rather than overwriting it, so trends are a
// free byproduct of the entry form in /products.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const weeks = Number(request.nextUrl.searchParams.get("weeks") ?? "8");
  const since = new Date();
  since.setDate(since.getDate() - 7 * (Number.isFinite(weeks) ? weeks : 8));

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("price_history")
    .select("price, recorded_at")
    .eq("product_id", id)
    .gte("recorded_at", since.toISOString())
    .order("recorded_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ history: data });
}
