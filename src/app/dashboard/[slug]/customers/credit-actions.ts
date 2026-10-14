"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";
import { MONEY_METHODS, parseDecimal } from "@/lib/format";

export type PaymentFormState = {
  error?: string;
  saved?: boolean;
  fieldErrors?: Partial<Record<"amount" | "method" | "note", string>>;
  values?: { amount?: string; method?: string; note?: string };
};

const PAYMENT_ERRORS: Record<string, PaymentFormState> = {
  forbidden: { error: "No tienes permiso para registrar abonos." },
  invalid_payment: { fieldErrors: { method: "Elige cómo pagó." } },
  invalid_amount: { fieldErrors: { amount: "Monto no válido. Ejemplo: 20.00" } },
  customer_not_found: { error: "Este cliente ya no existe." },
  no_debt: { error: "Este cliente no tiene deuda pendiente." },
  exceeds_balance: { fieldErrors: { amount: "El abono no puede ser mayor que la deuda." } },
  no_open_session: { error: "Para recibir efectivo necesitas una caja abierta." },
};

export async function registerPayment(
  slug: string,
  customerId: string,
  _: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  await assertPermission(slug, "credit:collect");
  if (!z.uuid().safeParse(customerId).success) return { error: "Cliente no válido." };

  const values = {
    amount: String(formData.get("amount") ?? "").trim(),
    method: String(formData.get("method") ?? ""),
    note: String(formData.get("note") ?? "").trim(),
  };
  const method = (MONEY_METHODS as readonly string[]).includes(values.method)
    ? (values.method as (typeof MONEY_METHODS)[number])
    : null;
  if (!method) return { values, fieldErrors: { method: "Elige cómo pagó." } };

  const amount = parseDecimal(values.amount, 2);
  if (amount === null || amount <= 0) return { values, fieldErrors: { amount: "Monto no válido. Ejemplo: 20.00" } };
  if (values.note.length > 200) return { values, fieldErrors: { note: "Usa como máximo 200 caracteres." } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_customer_payment", {
    p_customer_id: customerId,
    p_amount: amount,
    p_payment_method: method,
    p_note: values.note || null,
  });
  if (error) return { values, ...(PAYMENT_ERRORS[error.message] ?? { error: "No se pudo registrar el abono." }) };

  revalidatePath(`/dashboard/${slug}`, "layout");
  return { saved: true };
}

const VOID_ERRORS: Record<string, string> = {
  forbidden: "Solo el propietario o un administrador pueden anular abonos.",
  reason_required: "Escribe el motivo (mínimo 3 caracteres).",
  payment_not_found: "Este abono ya no existe.",
  already_voided: "Este abono ya estaba anulado.",
  session_closed: "La caja en que se recibió este efectivo ya se cerró; no se puede anular.",
};

export async function voidPayment(slug: string, paymentId: string, reason: string): Promise<{ error?: string }> {
  await assertPermission(slug, "credit:void");
  if (!z.uuid().safeParse(paymentId).success) return { error: "Abono no válido." };
  const r = String(reason ?? "").trim();
  if (r.length < 3) return { error: VOID_ERRORS.reason_required };
  if (r.length > 200) return { error: "Usa como máximo 200 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_customer_payment", { p_payment_id: paymentId, p_reason: r });
  if (error) return { error: VOID_ERRORS[error.message] ?? "No se pudo anular el abono." };

  revalidatePath(`/dashboard/${slug}`, "layout");
  return {};
}
