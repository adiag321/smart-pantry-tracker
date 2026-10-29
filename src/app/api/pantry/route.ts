import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Expiry tracking / "use soon" view (PRD section 3E). purchase_date drives
// FIFO deduction order; expiry_date is tracked separately because the two
// can disagree (a newer batch might still expire sooner). Batches without
// an expiry_date are included in the plain list but never flagged - not
// every item has a printed date, and that shouldn't block entry or make it
// look falsely urgent.
export async function GET(request: NextRequest) {
  const days = Number(request.nextUrl.searchParams.get("days") ?? "3");
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + (Number.isFinite(days) ? days : 3));

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inventory_batches")
    .select("*, products(name, store)")
    .gt("quantity_remaining", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const batches = data.map((batch) => ({
    ...batch,
    useSoon:
      batch.expiry_date != null && new Date(batch.expiry_date) <= threshold,
  }));

  // Batches with no expiry_date sort last by the query above but should sit
  // after the expiring ones regardless of insertion order within that group.
  batches.sort((a, b) => {
    if (a.expiry_date == null && b.expiry_date == null) return 0;
    if (a.expiry_date == null) return 1;
    if (b.expiry_date == null) return -1;
    return a.expiry_date.localeCompare(b.expiry_date);
  });

  return NextResponse.json({ batches });
}
