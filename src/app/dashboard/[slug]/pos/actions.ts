"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { parseDecimal } from "@/lib/format";

const saleSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.uuid(),
        quantity: z.number().positive().finite().max(999_999),
      }),
    )
    .min(1, "Agrega al menos un producto.")
    .max(200, "Máximo 200 líneas por venta."),
  payment_method: z.enum(["cash", "yape", "plin", "card", "transfer", "credit"]),
  amount_received: z.string().max(20).optional(),
  discount: z.string().max(20).optional(),
  customer_id: z.uuid().nullable().optional(),
});

export type SaleInput = z.input<typeof saleSchema>;
export type SaleResult =
  | { ok: true; sale: { id: string; number: number; total: number; change: number | null } }
  | { ok: false; error: string };

const SALE_ERRORS: Record<string, string> = {
  forbidden: "No tienes permiso para vender.",
  no_open_session: "La caja está cerrada. Ábrela para seguir vendiendo.",
  invalid_items: "El carrito no es válido. Recarga la página.",
  invalid_quantity: "Revisa las cantidades: los productos por unidad solo admiten enteros.",
  product_unavailable: "Un producto del carrito ya no está disponible. Recarga la página.",
  invalid_discount: "El descuento no puede ser mayor que el subtotal.",
  forbidden_discount: "Solo el propietario o un administrador pueden aplicar descuentos.",
  insufficient_payment: "El monto recibido es menor que el total.",
  customer_not_found: "El cliente seleccionado ya no existe.",
  invalid_payment: "Elige el medio de pago.",
  customer_required: "Para fiar tienes que elegir al cliente.",
};

export async function createSale(slug: string, input: SaleInput): Promise<SaleResult> {
  const ctx = await assertPermission(slug, "sales:create");
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const d = parsed.data;
  if (d.payment_method === "credit") {
    if (!can(ctx.role, "credit:sell")) return { ok: false, error: "No tienes permiso para vender al fiado." };
    if (!d.customer_id) return { ok: false, error: SALE_ERRORS.customer_required! };
  }

  let discount = 0;
  if (d.discount?.trim()) {
    if (!can(ctx.role, "sales:discount")) return { ok: false, error: SALE_ERRORS.forbidden_discount! };
    const v = parseDecimal(d.discount, 2);
    if (v === null) return { ok: false, error: "Descuento no válido. Ejemplo: 5.00" };
    discount = v;
  }

  let received: number | null = null;
  if (d.payment_method === "cash" && d.amount_received?.trim()) {
    received = parseDecimal(d.amount_received, 2);
    if (received === null) return { ok: false, error: "Monto recibido no válido. Ejemplo: 50.00" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_items: d.items,
    p_payment_method: d.payment_method,
    p_amount_received: received,
    p_discount: discount,
    p_customer_id: d.customer_id ?? null,
  });

  if (error || !data) {
    if (error?.code === "22003") return { ok: false, error: "El importe es demasiado grande." };
    return { ok: false, error: (error && SALE_ERRORS[error.message]) ?? "No se pudo registrar la venta. Inténtalo de nuevo." };
  }

  revalidatePath(`/dashboard/${slug}`, "layout");
  return { ok: true, sale: { id: data.id, number: data.number, total: data.total, change: data.change_given } };
}

export type CustomerOption = { id: string; full_name: string; document_id: string | null; phone: string | null };

/** Búsqueda de clientes para asociarlos a la venta (máx. 8 resultados). */
export async function searchCustomers(slug: string, q: string): Promise<CustomerOption[]> {
  await assertPermission(slug, "sales:create");
  const term = String(q ?? "").trim().slice(0, 60);
  if (term.length < 2) return [];
  // Escapa comodines y separadores de PostgREST antes de usar ilike/or.
  const safe = term.replace(/[%_,()\\]/g, " ");
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, document_id, phone")
    .or(`full_name.ilike.%${safe}%,document_id.ilike.%${safe}%,phone.ilike.%${safe}%`)
    .order("full_name")
    .limit(8);
  return data ?? [];
}
