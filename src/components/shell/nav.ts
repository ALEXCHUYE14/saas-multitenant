import { LayoutGrid, Armchair, ChartColumn, CreditCard, Package, Receipt, Settings, ShoppingCart, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/permissions";

export type NavItem = {
  label: string;
  path: string; // relativo a /dashboard/[slug], salvo que absolute = true
  absolute?: boolean;
  icon: LucideIcon;
  permission?: Permission;
};

/** Agrega aquí los módulos de cada vertical (ventas, citas, inventario…). */
export const NAV_ITEMS: NavItem[] = [
  { label: "Resumen", path: "", icon: LayoutGrid },
  { label: "Vender", path: "/pos", icon: ShoppingCart, permission: "sales:create" },
  { label: "Mesas", path: "/tables", icon: Armchair, permission: "orders:operate" },
  { label: "Ventas", path: "/sales", icon: Receipt, permission: "sales:read" },
  { label: "Caja", path: "/cash", icon: Wallet, permission: "cash:operate" },
  { label: "Reportes", path: "/reports", icon: ChartColumn, permission: "reports:read" },
  { label: "Clientes", path: "/customers", icon: UserRound, permission: "customers:read" },
  { label: "Productos", path: "/products", icon: Package, permission: "products:read" },
  { label: "Equipo", path: "/team", icon: Users, permission: "members:read" },
  { label: "Ajustes", path: "/settings", icon: Settings, permission: "org:update" },
  { label: "Suscripción", path: "/billing", icon: CreditCard, permission: "org:billing", absolute: true },
];
