"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";

export type VoidState = { error?: string; reason?: string };

const VOID_ERRORS: Record<string, string> = {
  forbidden: "Solo el propietario o un administrador pueden anular ventas.",
  reason_required: "Escribe el motivo de la anulación (mínimo 3 caracteres).",
  sale_not_found: "Esta venta ya no existe.",
  already_voided: "Esta venta ya estaba anulada.",
  session_closed: "La caja de esta venta ya se cerró; no se puede anular.",
};

export async function voidSale(slug: string, saleId: string, _: VoidState, formData: FormData): Promise<VoidState> {
  await assertPermission(slug, "sales:void");
  if (!z.uuid().safeParse(saleId).success) return { error: "Venta no válida." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { reason, error: VOID_ERRORS.reason_required };
  if (reason.length > 200) return { reason, error: "Usa como máximo 200 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_sale", { p_sale_id: saleId, p_reason: reason });
  if (error) return { reason, error: VOID_ERRORS[error.message] ?? "No se pudo anular la venta." };

  revalidatePath(`/dashboard/${slug}`, "layout");
  return {};
}
