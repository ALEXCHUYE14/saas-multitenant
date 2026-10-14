"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";
import { parseDecimal, unitDecimals } from "@/lib/format";
import type { ProductUnit } from "@/lib/supabase/database.types";

const FIELDS = ["name", "code", "category", "unit", "price", "cost", "track_stock", "stock", "min_stock"] as const;
type ProductField = (typeof FIELDS)[number];

export type ProductFormState = {
  error?: string;
  fieldErrors?: Partial<Record<ProductField, string>>;
  /** Lo enviado: React 19 reinicia el formulario tras la acción y así no se pierde. */
  values?: Partial<Record<ProductField, string>>;
};

const UNITS = ["unit", "kg", "l", "service"] as const satisfies readonly ProductUnit[];
const uuid = z.uuid();

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

type ParsedProduct = {
  name: string;
  code: string | null;
  category: string | null;
  unit: ProductUnit;
  price: number;
  cost: number | null;
  track_stock: boolean;
  stock: number;
  min_stock: number | null;
};

function parseProduct(formData: FormData): { ok: true; data: ParsedProduct } | { ok: false; state: ProductFormState } {
  const values = Object.fromEntries(FIELDS.map((k) => [k, str(formData, k)])) as Record<ProductField, string>;
  const errors: ProductFormState["fieldErrors"] = {};

  const name = values.name;
  if (name.length < 1) errors.name = "Escribe el nombre.";
  else if (name.length > 120) errors.name = "Usa como máximo 120 caracteres.";

  const code = values.code || null;
  if (code && !/^[A-Za-z0-9._-]{1,40}$/.test(code)) errors.code = "Solo letras, números, punto, guion o guion bajo (máx. 40).";

  const category = values.category || null;
  if (category && category.length > 60) errors.category = "Usa como máximo 60 caracteres.";

  const unit = (UNITS as readonly string[]).includes(values.unit) ? (values.unit as ProductUnit) : null;
  if (!unit) errors.unit = "Elige una unidad.";

  const price = parseDecimal(values.price, 2);
  if (price === null) errors.price = values.price ? "Precio no válido. Ejemplo: 12.50" : "Escribe el precio.";

  const cost = values.cost ? parseDecimal(values.cost, 2) : null;
  if (values.cost && cost === null) errors.cost = "Costo no válido. Ejemplo: 8.00";

  // Los servicios nunca llevan stock.
  const trackStock = unit !== "service" && values.track_stock === "on";
  const decimals = unit ? unitDecimals(unit) : 3;
  const qtyError = decimals === 0 ? "Usa un número entero." : "Número no válido (hasta 3 decimales).";

  let stock = 0;
  let minStock: number | null = null;
  if (trackStock) {
    if (values.stock) {
      const s = parseDecimal(values.stock, decimals);
      if (s === null) errors.stock = qtyError;
      else stock = s;
    }
    if (values.min_stock) {
      const m = parseDecimal(values.min_stock, decimals);
      if (m === null) errors.min_stock = qtyError;
      else minStock = m;
    }
  }

  if (Object.keys(errors).length || !unit || price === null) return { ok: false, state: { values, fieldErrors: errors } };

  return {
    ok: true,
    data: { name, code, category, unit, price, cost, track_stock: trackStock, stock, min_stock: minStock },
  };
}

function dbError(error: { code?: string; message: string }, values: ProductFormState["values"]): ProductFormState {
  if (error.code === "23505") return { values, fieldErrors: { code: "Ya hay un producto con ese código." } };
  if (error.message.includes("products_unit_whole"))
    return { values, fieldErrors: { unit: "El stock actual tiene decimales. Ajústalo a un número entero antes de cambiar a unidades." } };
  return { values, error: "No se pudo guardar el producto. Inténtalo de nuevo." };
}

export async function createProduct(slug: string, _: ProductFormState, formData: FormData): Promise<ProductFormState> {
  await assertPermission(slug, "products:write");
  const parsed = parseProduct(formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  // organization_id lo pone la BD; el stock inicial queda en el kardex (trigger).
  const { error } = await supabase.from("products").insert(parsed.data);
  if (error) return dbError(error, Object.fromEntries(FIELDS.map((k) => [k, str(formData, k)])));

  revalidatePath(`/dashboard/${slug}`, "layout");
  redirect(`/dashboard/${slug}/products`);
}

export async function updateProduct(
  slug: string,
  id: string,
  _: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await assertPermission(slug, "products:write");
  if (!uuid.safeParse(id).success) return { error: "Producto no válido." };
  const parsed = parseProduct(formData);
  if (!parsed.ok) return parsed.state;

  // El stock no se toca aquí: solo cambia con movimientos (adjust_stock).
  const { stock: _stock, ...changes } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update(changes).eq("id", id).select("id");

  if (error) return dbError(error, Object.fromEntries(FIELDS.map((k) => [k, str(formData, k)])));
  if (!data?.length) return { error: "Este producto ya no existe." };

  revalidatePath(`/dashboard/${slug}`, "layout");
  redirect(`/dashboard/${slug}/products`);
}

export async function setProductActive(slug: string, id: string, active: boolean): Promise<{ error?: string }> {
  await assertPermission(slug, "products:write");
  if (!uuid.safeParse(id).success) return { error: "Producto no válido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ active }).eq("id", id).select("id");
  if (error || !data?.length) return { error: "No se pudo actualizar el producto." };
  revalidatePath(`/dashboard/${slug}`, "layout");
  return {};
}

export async function deleteProduct(slug: string, id: string): Promise<{ error?: string }> {
  await assertPermission(slug, "products:write");
  if (!uuid.safeParse(id).success) return { error: "Producto no válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "Este producto ya tiene ventas registradas. Archívalo en lugar de eliminarlo." };
    return { error: "No se pudo eliminar el producto." };
  }
  revalidatePath(`/dashboard/${slug}`, "layout");
  return {};
}

// -----------------------------------------------------------------------------
// Movimientos de stock
// -----------------------------------------------------------------------------
export type AdjustState = {
  error?: string;
  saved?: boolean;
  fieldErrors?: Partial<Record<"kind" | "quantity" | "note", string>>;
};

const KINDS = ["purchase", "waste", "adjustment"] as const;

const ADJUST_ERRORS: Record<string, AdjustState> = {
  forbidden: { error: "No tienes permiso para mover el stock." },
  product_not_found: { error: "Este producto ya no existe." },
  stock_not_tracked: { error: "Este producto no controla stock." },
  invalid_quantity: { fieldErrors: { quantity: "Cantidad no válida para la unidad del producto." } },
  no_change: { fieldErrors: { quantity: "El stock ya tiene ese valor." } },
};

export async function adjustStock(slug: string, productId: string, _: AdjustState, formData: FormData): Promise<AdjustState> {
  await assertPermission(slug, "inventory:adjust");
  if (!uuid.safeParse(productId).success) return { error: "Producto no válido." };

  const kind = str(formData, "kind");
  if (!(KINDS as readonly string[]).includes(kind)) return { fieldErrors: { kind: "Elige el tipo de movimiento." } };

  const note = str(formData, "note");
  if (note.length > 200) return { fieldErrors: { note: "Usa como máximo 200 caracteres." } };

  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("unit").eq("id", productId).maybeSingle();
  if (!product) return { error: "Este producto ya no existe." };

  const raw = str(formData, "quantity");
  const quantity = parseDecimal(raw, unitDecimals(product.unit));
  if (quantity === null)
    return { fieldErrors: { quantity: unitDecimals(product.unit) === 0 ? "Usa un número entero." : "Número no válido (hasta 3 decimales)." } };
  if (kind !== "adjustment" && quantity === 0) return { fieldErrors: { quantity: "La cantidad debe ser mayor que 0." } };

  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: productId,
    p_kind: kind as (typeof KINDS)[number],
    p_quantity: quantity,
    p_note: note || null,
  });

  if (error) {
    if (error.code === "22003") return { fieldErrors: { quantity: "La cantidad es demasiado grande." } };
    return ADJUST_ERRORS[error.message] ?? { error: "No se pudo registrar el movimiento. Inténtalo de nuevo." };
  }

  revalidatePath(`/dashboard/${slug}`, "layout");
  return { saved: true };
}
