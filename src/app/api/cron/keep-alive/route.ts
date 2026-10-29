import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Supabase free-tier projects auto-pause after ~7 days with no activity
// (PRD section 5). Vercel Cron hits this daily so a trivial read keeps the
// project alive without needing the GitHub Actions scraper pipeline, which
// was dropped after Walmart/H-E-B confirmed-blocked automated access.
//
// Exempted from the shared-password proxy gate (src/proxy.ts) since Vercel
// Cron requests carry no cookies - secured instead by comparing against
// CRON_SECRET, which Vercel automatically sends as a Bearer token for cron
// invocations.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("products").select("id").limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
