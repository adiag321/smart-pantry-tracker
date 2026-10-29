import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Server-only. The service-role key bypasses RLS, so this client must never
// be imported from a Client Component or exposed to the browser - this is a
// single-user app gated by APP_SHARED_PASSWORD (see middleware.ts), not
// Supabase Auth, so there is no per-request user session to scope queries to.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
