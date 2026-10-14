import type { PaymentMethod, ProductUnit } from "@/lib/supabase/database.types";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 });

/** 12.5 → "S/ 12.50" */
export function formatMoney(value: number | null | undefined): string {
  return value == null ? "—" : money.format(value);
}

export const UNIT_LABEL: Record<ProductUnit, string> = {
  unit: "Unidad",
  kg: "Kilogramo",
  l: "Litro",
  service: "Servicio",
};

const UNIT_SHORT: Record<ProductUnit, string> = { unit: "und", kg: "kg", l: "L", service: "" };

/** Decimales permitidos por unidad: las unidades son enteras; kg y L hasta gramos/mililitros. */
export function unitDecimals(unit: ProductUnit): number {
  return unit === "kg" || unit === "l" ? 3 : 0;
}

/** 1.5 kg → "1.5 kg"; 3 und → "3 und" */
export function formatQty(value: number | null | undefined, unit: ProductUnit): string {
  if (value == null) return "—";
  const n = new Intl.NumberFormat("es-PE", { maximumFractionDigits: unitDecimals(unit) }).format(value);
  return UNIT_SHORT[unit] ? `${n} ${UNIT_SHORT[unit]}` : n;
}

/**
 * Convierte texto del usuario a número validando el formato como texto
 * (no con floats): acepta "12", "12.5", "12,50". Devuelve null si no es válido.
 */
export function parseDecimal(raw: string, maxDecimals: number, maxIntDigits = 9): number | null {
  const s = raw.trim().replace(",", ".");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  const [, int = "", dec] = m ?? [];
  if (!m || int.length > maxIntDigits) return null;
  if (dec !== undefined && (maxDecimals === 0 || dec.length > maxDecimals)) return null;
  return Number(s);
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  card: "Tarjeta",
  transfer: "Transferencia",
  credit: "Fiado",
};

/** Medios con los que se puede cobrar dinero (todos menos fiado). */
export const MONEY_METHODS = ["cash", "yape", "plin", "card", "transfer"] as const satisfies readonly PaymentMethod[];

/** Soles → céntimos enteros (evita errores de coma flotante al sumar). */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Importe de una línea en céntimos, igual que la BD: round(cantidad × precio, 2).
 * Cantidad en milésimas y precio en céntimos → aritmética entera.
 */
export function lineCents(quantity: number, unitPrice: number): number {
  return Math.round((Math.round(quantity * 1000) * toCents(unitPrice)) / 1000);
}

export function formatCents(cents: number): string {
  return formatMoney(cents / 100);
}
