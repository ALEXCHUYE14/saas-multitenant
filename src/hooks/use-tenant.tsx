"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { can as canFn, type Permission } from "@/lib/permissions";
import type { Organization, OrgRole } from "@/lib/supabase/database.types";

type TenantValue = {
  organization: Organization;
  organizationId: string;
  role: OrgRole;
  userId: string;
  fullName: string | null;
  email: string | null;
  can: (permission: Permission) => boolean;
  /** Construye rutas dentro del tenant: href("/customers") → /dashboard/mi-slug/customers */
  href: (path?: string) => string;
};

const TenantContext = createContext<TenantValue | null>(null);

export function TenantProvider({
  value,
  children,
}: {
  value: Omit<TenantValue, "can" | "href" | "organizationId">;
  children: ReactNode;
}) {
  const memo = useMemo<TenantValue>(
    () => ({
      ...value,
      organizationId: value.organization.id,
      can: (p) => canFn(value.role, p),
      href: (path = "") => `/dashboard/${value.organization.slug}${path}`,
    }),
    [value],
  );
  return <TenantContext.Provider value={memo}>{children}</TenantContext.Provider>;
}

/**
 * Hook cliente: devuelve el tenant activo validado en el servidor.
 * Verifica además que el [slug] de la URL coincida con la organización cargada.
 */
export function useTenant(): TenantValue {
  const ctx = useContext(TenantContext);
  const params = useParams<{ slug?: string }>();
  if (!ctx) throw new Error("useTenant() debe usarse dentro de /dashboard/[slug]");
  if (params.slug && params.slug !== ctx.organization.slug) {
    throw new Error("El slug de la URL no coincide con el tenant activo");
  }
  return ctx;
}
