/**
 * Configuración de cobro de la plataforma. Estos datos son públicos (se muestran
 * a los clientes para que te paguen); los secretos van en variables de entorno.
 *
 * IMPORTANTE: el precio también está en la BD (private.billing_price()). Si lo
 * cambias, cambia ambos.
 */
export const BILLING = {
  priceSoles: 35,
  priceLabel: "S/ 35",
  trialDays: 14,
  graceDays: 3,
  bank: {
    name: "Interbank",
    accountType: "Cuenta Simple Soles",
    holder: "Miguel Alexander Flores Chuye",
    account: "7733259712394",
    cci: "00377301325971239493",
  },
  // Yape y Plin se cobran con los QR de src/img/ (yape.jpeg, plin.jpeg).
  // Opcional: número para "Yapear al celular" (si está vacío, solo se muestra el QR).
  yapeNumber: process.env.NEXT_PUBLIC_BILLING_YAPE_NUMBER?.trim() || null,
  plinNumber: process.env.NEXT_PUBLIC_BILLING_PLIN_NUMBER?.trim() || null,
  // WhatsApp para enviar comprobantes y soporte (formato internacional sin "+").
  whatsapp: "51924996961",
  whatsappLabel: "+51 924 996 961",
} as const;

/** Enlace de WhatsApp con un mensaje ya escrito. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${BILLING.whatsapp}?text=${encodeURIComponent(message)}`;
}

/** Número de operación como lo guarda la BD: sin espacios ni puntos, en mayúsculas. */
export function normalizeOperation(raw: string): string {
  return raw.replace(/[\s.]/g, "").toUpperCase();
}

const DAY_MS = 86_400_000;

type AccessFields = { trial_ends_at: string; paid_until: string | null; provisional_until: string | null };

/** Misma regla que private.access_until() en la BD: el mayor de prueba, pagado + gracia y provisional. */
export function accessUntil(o: AccessFields): Date {
  const times = [
    Date.parse(o.trial_ends_at),
    o.paid_until ? Date.parse(o.paid_until) + BILLING.graceDays * DAY_MS : Number.NaN,
    o.provisional_until ? Date.parse(o.provisional_until) : Number.NaN,
  ].filter((t) => Number.isFinite(t));
  return new Date(times.length ? Math.max(...times) : 0);
}

/** Días completos que faltan (0 si ya venció). */
export function daysLeft(until: Date, now = Date.now()): number {
  return Math.max(0, Math.ceil((until.getTime() - now) / DAY_MS));
}

export type BillingPhase = "trial" | "paid" | "grace" | "provisional" | "expired";

/** En qué etapa está el negocio, para mostrar el mensaje correcto. */
export function billingPhase(o: AccessFields, now = Date.now()): BillingPhase {
  const paid = o.paid_until ? Date.parse(o.paid_until) : Number.NaN;
  if (Number.isFinite(paid) && paid > now) return "paid";
  if (Date.parse(o.trial_ends_at) > now) return "trial";
  if (Number.isFinite(paid) && paid + BILLING.graceDays * DAY_MS > now) return "grace";
  if (o.provisional_until && Date.parse(o.provisional_until) > now) return "provisional";
  return "expired";
}
