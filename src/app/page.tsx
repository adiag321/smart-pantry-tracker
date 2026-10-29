import { redirect } from "next/navigation";

// The pantry dashboard is the natural home screen (PRD section 6, Phase 7) -
// everything else is reachable from the nav bar.
export default function Home() {
  redirect("/pantry");
}
