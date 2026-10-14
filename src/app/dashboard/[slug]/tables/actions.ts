"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { parseDecimal } from "@/lib/format";

const uuid = z.uuid();

const ORDER_ERRORS: Record<string, string> = {
  forbidden: "No tienes permiso para esta acción.",
  order_not_found: "Este pedido ya no existe.",
  order_closed: "Este pedido ya fue cobrado o cancelado. Recarga la página.",
  order_empty: "El pedido no tiene productos.",
  table_not_found: "Esa mesa no existe o está desactivada.",
  table_busy: "Esa mesa ya tiene una cuenta abierta.",
  product_unavailable: "Ese producto ya no está disponible.",
  invalid_quantity: "Cantidad no válida para ese producto (las unidades solo admiten enteros).",
  item_not_found: "Ese producto ya no está en el pedido.",
  reason_required: "Escribe el motivo (mínimo 3 caracteres).",
  // Errores de create_sale al cobrar:
  no_open_session: "La caja está cerrada. Ábrela para cobrar.",
  invalid_discount: "El descuento no puede ser mayor que el subtotal.",
  forbidden_discount: "Solo el propietario o un administrador pueden aplicar descuentos.",
  insufficient_payment: "El monto recibido es menor que el total.",
  customer_not_found: "El cliente seleccionado ya no existe.",
  customer_required: "Para fiar tienes que elegir al cliente.",
  invalid_items: "El pedido no es válido. Recarga la página.",
};

type Result = { error?: string };

function fail(error: { code?: string; message: string } | null, fallback: string): Result {
  if (error?.code === "22003") return { error: "El importe es demasiado grande." };
  return { error: (error && ORDER_ERRORS[error.message]) ?? fallback };
}

function revalidate(slug: string) {
  revalidatePath(`/dashboard/${slug}`, "layout");
}

// -----------------------------------------------------------------------------
// Mesas (owner/admin)
// -----------------------------------------------------------------------------
export type TableFormState = { error?: string; saved?: boolean; savedAt?: string; name?: string };

export async function createTable(slug: string, _: TableFormState, formData: FormData): Promise<TableFormState> {
  await assertPermission(slug, "tables:manage");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 30) return { name, error: "El nombre debe tener entre 1 y 30 caracteres." };

  const supabase = await createClient();
  const { count } = await supabase.from("dining_tables").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("dining_tables").insert({ name, sort_order: Math.min(count ?? 0, 9999) });
  if (error) {
    if (error.code === "23505") return { name, error: "Ya hay una mesa con ese nombre." };
    return { name, error: "No se pudo crear la mesa." };
  }
  revalidate(slug);
  // savedAt cambia en cada guardado: el formulario se vacía (key) solo entonces.
  return { saved: true, savedAt: String(Date.now()) };
}

export async function setTableActive(slug: string, tableId: string, active: boolean): Promise<Result> {
  await assertPermission(slug, "tables:manage");
  if (!uuid.safeParse(tableId).success) return { error: "Mesa no válida." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("dining_tables").update({ active }).eq("id", tableId).select("id");
  if (error || !data?.length) return { error: "No se pudo actualizar la mesa." };
  revalidate(slug);
  return {};
}

// -----------------------------------------------------------------------------
// Pedidos (cualquier miembro)
// -----------------------------------------------------------------------------
export async function openOrder(slug: string, tableId: string | null, label?: string): Promise<Result> {
  await assertPermission(slug, "orders:operate");
  if (tableId !== null && !uuid.safeParse(tableId).success) return { error: "Mesa no válida." };
  const cleanLabel = String(label ?? "").trim().slice(0, 40);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_order", {
    p_table_id: tableId,
    p_label: tableId ? null : cleanLabel || "Para llevar",
  });

  if (error) {
    // Otro mozo la abrió primero: lleva a esa cuenta en lugar de fallar.
    if (error.message === "table_busy" && tableId) {
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("table_id", tableId)
        .eq("status", "open")
        .maybeSingle();
      if (existing) redirect(`/dashboard/${slug}/tables/${existing.id}`);
    }
    return fail(error, "No se pudo abrir el pedido.");
  }

  revalidate(slug);
  redirect(`/dashboard/${slug}/tables/${data.id}`);
}

export async function addOrderItem(slug: string, orderId: string, productId: string, note?: string): Promise<Result> {
  await assertPermission(slug, "orders:operate");
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(productId).success) return { error: "Datos no válidos." };
  const cleanNote = String(note ?? "").trim();
  if (cleanNote.length > 120) return { error: "La nota admite como máximo 120 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_order_item", {
    p_order_id: orderId,
    p_product_id: productId,
    p_quantity: 1,
    p_note: cleanNote || null,
  });
  if (error) return fail(error, "No se pudo agregar el producto.");
  revalidate(slug);
  return {};
}

/** `quantity` llega como texto del input ("2", "0.5", "1,25"); "0" quita la línea. */
export async function setOrderItemQuantity(slug: string, itemId: string, quantity: string): Promise<Result> {
  await assertPermission(slug, "orders:operate");
  if (!uuid.safeParse(itemId).success) return { error: "Ítem no válido." };
  const q = parseDecimal(String(quantity ?? ""), 3, 6);
  if (q === null) return { error: ORDER_ERRORS.invalid_quantity };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_order_item_quantity", { p_item_id: itemId, p_quantity: q });
  if (error) return fail(error, "No se pudo cambiar la cantidad.");
  revalidate(slug);
  return {};
}

export async function moveOrder(slug: string, orderId: string, tableId: string | null): Promise<Result> {
  await assertPermission(slug, "orders:operate");
  if (!uuid.safeParse(orderId).success || (tableId !== null && !uuid.safeParse(tableId).success))
    return { error: "Datos no válidos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_order", { p_order_id: orderId, p_table_id: tableId });
  if (error) return fail(error, "No se pudo cambiar de mesa.");
  revalidate(slug);
  return {};
}

export async function cancelOrder(slug: string, orderId: string, reason: string): Promise<Result> {
  await assertPermission(slug, "orders:operate");
  if (!uuid.safeParse(orderId).success) return { error: "Pedido no válido." };
  const r = String(reason ?? "").trim().slice(0, 200);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: r || null });
  if (error) {
    if (error.message === "forbidden") return { error: "Solo el propietario o un administrador pueden cancelar un pedido con productos." };
    return fail(error, "No se pudo cancelar el pedido.");
  }
  revalidate(slug);
  redirect(`/dashboard/${slug}/tables`);
}

const paySchema = z.object({
  payment_method: z.enum(["cash", "yape", "plin", "card", "transfer", "credit"]),
  amount_received: z.string().max(20).optional(),
  discount: z.string().max(20).optional(),
  customer_id: z.uuid().nullable(),
});

export type PayOrderResult = { ok: true; saleId: string; number: number; total: number; change: number | null } | { ok: false; error: string };

export async function payOrder(slug: string, orderId: string, input: z.input<typeof paySchema>): Promise<PayOrderResult> {
  const ctx = await assertPermission(slug, "sales:create");
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Pedido no válido." };
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de pago no válidos." };
  const d = parsed.data;

  if (d.payment_method === "credit") {
    if (!can(ctx.role, "credit:sell")) return { ok: false, error: "No tienes permiso para vender al fiado." };
    if (!d.customer_id) return { ok: false, error: ORDER_ERRORS.customer_required! };
  }

  let discount = 0;
  if (d.discount?.trim()) {
    if (!can(ctx.role, "sales:discount")) return { ok: false, error: ORDER_ERRORS.forbidden_discount! };
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
  const { data, error } = await supabase.rpc("pay_order", {
    p_order_id: orderId,
    p_payment_method: d.payment_method,
    p_amount_received: received,
    p_discount: discount,
    p_customer_id: d.customer_id,
  });
  if (error || !data) return { ok: false, error: fail(error, "No se pudo cobrar el pedido.").error! };

  revalidate(slug);
  return { ok: true, saleId: data.id, number: data.number, total: data.total, change: data.change_given };
}
