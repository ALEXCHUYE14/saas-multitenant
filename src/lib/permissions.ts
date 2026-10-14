import type { OrgRole } from "@/lib/supabase/database.types";

/**
 * Matriz de permisos de la app (UX). La autoridad final es RLS en Postgres:
 * esto solo decide qué se muestra / qué acciones se ofrecen.
 */
export const PERMISSIONS = {
  "org:update": ["owner", "admin"],
  "org:billing": ["owner"],
  "members:read": ["owner", "admin", "staff"],
  "members:invite": ["owner", "admin"],
  "members:manage": ["owner", "admin"],
  "customers:read": ["owner", "admin", "staff"],
  "customers:write": ["owner", "admin", "staff"],
  "customers:delete": ["owner", "admin"],
  "products:read": ["owner", "admin", "staff"],
  "products:write": ["owner", "admin"],
  "inventory:adjust": ["owner", "admin"],
  "sales:create": ["owner", "admin", "staff"],
  "sales:read": ["owner", "admin", "staff"],
  "sales:discount": ["owner", "admin"],
  "sales:void": ["owner", "admin"],
  "cash:operate": ["owner", "admin", "staff"],
  "credit:sell": ["owner", "admin", "staff"],
  "credit:collect": ["owner", "admin", "staff"],
  "credit:void": ["owner", "admin"],
  "orders:operate": ["owner", "admin", "staff"],
  "tables:manage": ["owner", "admin"],
  "reports:read": ["owner", "admin"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: OrgRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  staff: "Personal",
};
