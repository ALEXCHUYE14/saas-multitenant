import { redirect } from "next/navigation";
import { getMembership } from "@/lib/tenant";

/** /dashboard → /dashboard/<slug del usuario> (o onboarding). */
export default async function DashboardIndex() {
  const m = await getMembership();
  if (m.status === "unauthenticated") redirect("/login");
  if (m.status === "no-organization") redirect("/onboarding");
  if (m.status === "inactive") redirect("/billing");
  redirect(`/dashboard/${m.ctx.organization.slug}`);
}
