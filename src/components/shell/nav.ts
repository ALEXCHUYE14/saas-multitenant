import { LayoutGrid, Settings, UserRound, Users, type LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/permissions";

export type NavItem = {
  label: string;
  path: string; // relativo a /dashboard/[slug]
  icon: LucideIcon;
  permission?: Permission;
};

/** Agrega aquí los módulos de cada vertical (ventas, citas, inventario…). */
export const NAV_ITEMS: NavItem[] = [
  { label: "Resumen", path: "", icon: LayoutGrid },
  { label: "Clientes", path: "/customers", icon: UserRound, permission: "customers:read" },
  { label: "Equipo", path: "/team", icon: Users, permission: "members:read" },
  { label: "Ajustes", path: "/settings", icon: Settings, permission: "org:update" },
];
