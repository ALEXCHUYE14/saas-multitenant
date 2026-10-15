import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, type Permission } from "@/lib/permissions";
import type { Organization, OrgRole } from "@/lib/supabase/database.types";

export type TenantContext = {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: OrgRole;
  organization: Organization;
};

type Membership =
  | { status: "unauthenticated" }
  | { status: "no-organization"; userId: string }
  | { status: "inactive"; userId: string } // org vencida, suspendida o cancelada (RLS la oculta)
  | { status: "member"; ctx: TenantContext };

/**
 * Resuelve la membresía del usuario actual. Memoizado por request con
 * React.cache: layout + page + server actions comparten una sola consulta.
 */
export const getMembership = cache(async (): Promise<Membership> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { status: "unauthenticated" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, organization_id, organization:organizations(*)")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el perfil: ${error.message}`);
  if (!profile?.organization_id) return { status: "no-organization", userId: user.id };
  if (!profile.organization) return { status: "inactive", userId: user.id };

  return {
    status: "member",
    ctx: {
      userId: user.id,
      email: user.email ?? null,
      fullName: profile.full_name,
      role: profile.role,
      organization: profile.organization,
    },
  };
});

/**
 * Helper principal para rutas /dashboard/[slug]/...
 * - Sin sesión            → /login
 * - Sin organización      → /onboarding
 * - Org vencida/suspendida → /billing (pagar o ver el motivo)
 * - Slug de OTRO tenant   → 404 (no revela si el slug existe)
 * - Permiso insuficiente  → 404 o redirect según `onForbidden`
 */
export async function getTenantContext(
  slug: string,
  opts: { require?: Permission; onForbidden?: "notFound" | "redirect" } = {},
): Promise<TenantContext> {
  const m = await getMembership();

  switch (m.status) {
    case "unauthenticated":
      redirect(`/login?next=${encodeURIComponent(`/dashboard/${slug}`)}`);
    case "no-organization":
      redirect("/onboarding");
    case "inactive":
      redirect("/billing");
  }

  const ctx = m.ctx;
  if (ctx.organization.slug !== slug.toLowerCase()) notFound();

  if (opts.require && !can(ctx.role, opts.require)) {
    if (opts.onForbidden === "redirect") redirect(`/dashboard/${ctx.organization.slug}`);
    notFound();
  }

  return ctx;
}

/** Atajo para Server Actions: lanza error en vez de redirigir. */
export async function assertPermission(slug: string, permission: Permission): Promise<TenantContext> {
  const m = await getMembership();
  if (m.status !== "member" || m.ctx.organization.slug !== slug) throw new Error("No autorizado");
  if (!can(m.ctx.role, permission)) throw new Error("Permiso insuficiente");
  return m.ctx;
}
