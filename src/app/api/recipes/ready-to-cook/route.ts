import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findReadyToCook } from "@/lib/recipes/readyToCook";

export async function GET() {
  const supabase = createAdminClient();
  try {
    const { ready, almost } = await findReadyToCook(supabase);
    return NextResponse.json({ ready, almost });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
