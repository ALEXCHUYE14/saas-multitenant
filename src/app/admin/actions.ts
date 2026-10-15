"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// La autorización real está en la BD (private.assert_platform_admin en cada función).
const uuid = z.uuid();

const ERRORS: Record<string, string> = {
  forbidden: "No tienes permisos de administrador.",
  payment_not_found: "Ese pago ya no existe.",
  already_reviewed: "Ese pago ya fue revisado.",
  reason_required: "Escribe el motivo del rechazo (mínimo 3 caracteres).",
  org_not_found: "Ese negocio ya no existe.",
  invalid_days: "Días no válidos (1 a 90).",
  invalid_status: "Estado no válido.",
};

type Result = { error?: string };
const fail = (message: string | undefined, fallback: string): Result => ({ error: (message && ERRORS[message]) ?? fallback });

export async function reviewPayment(paymentId: string, approve: boolean, reason?: string): Promise<Result> {
  if (!uuid.safeParse(paymentId).success) return { error: "Pago no válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_payment", {
    p_payment_id: paymentId,
    p_approve: approve,
    p_reason: reason?.trim().slice(0, 200) || null,
  });
  if (error) return fail(error.message, "No se pudo revisar el pago.");
  revalidatePath("/admin");
  return {};
}

export async function setOrgStatus(orgId: string, status: "active" | "suspended"): Promise<Result> {
  if (!uuid.safeParse(orgId).success || !["active", "suspended"].includes(status)) return { error: "Datos no válidos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_org_status", { p_org: orgId, p_status: status });
  if (error) return fail(error.message, "No se pudo cambiar el estado.");
  revalidatePath("/admin");
  return {};
}

export async function extendTrial(orgId: string, days: number): Promise<Result> {
  if (!uuid.safeParse(orgId).success || !Number.isInteger(days) || days < 1 || days > 90) return { error: "Datos no válidos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_extend_trial", { p_org: orgId, p_days: days });
  if (error) return fail(error.message, "No se pudo extender la prueba.");
  revalidatePath("/admin");
  return {};
}
