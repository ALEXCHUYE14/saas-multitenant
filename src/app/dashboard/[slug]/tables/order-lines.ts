import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ProductUnit } from "@/lib/supabase/database.types";

export type OrderLine = {
  id: string;
  productId: string;
  name: string;
  unit: ProductUnit;
  price: number;
  quantity: number;
  note: string | null;
  available: boolean;
};

/**
 * Líneas de un pedido con nombre, precio y disponibilidad actuales del producto.
 * Única fuente para la página y para las acciones (que devuelven solo esto en
 * vez de recargar la página entera con todo el catálogo).
 */
export async function loadOrderLines(supabase: Awaited<ReturnType<typeof createClient>>, orderId: string): Promise<OrderLine[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, product_id, quantity, note, product:products(name, unit, price, active)")
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw new Error(error.message);

  return (data ?? []).map((it) => ({
    id: it.id,
    productId: it.product_id,
    name: it.product?.name ?? "Producto",
    unit: it.product?.unit ?? "unit",
    price: it.product?.price ?? 0,
    quantity: it.quantity,
    note: it.note,
    available: Boolean(it.product?.active),
  }));
}
