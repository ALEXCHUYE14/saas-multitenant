"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";
import { parseDecimal } from "@/lib/format";

export type CashFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"amount" | "note", string>>;
  values?: { amount?: string; note?: string };
};

const CASH_ERRORS: Record<string, CashFormState> = {
  forbidden: { error: "No tienes permiso para operar la caja." },
  invalid_amount: { fieldErrors: { amount: "Monto no válido. Ejemplo: 150.00" } },
  session_already_open: { error: "Ya hay una caja abierta. Recarga la página." },
  session_not_open: { error: "Esta caja ya fue cerrada. Recarga la página." },
};

function readAmount(formData: FormData) {
  const raw = String(formData.get("amount") ?? "").trim();
  return { raw, value: raw ? parseDecimal(raw, 2) : null };
}

export async function openCashSession(slug: string, _: CashFormState, formData: FormData): Promise<CashFormState> {
  await assertPermission(slug, "cash:operate");
  const { raw, value } = readAmount(formData);
  // Vacío = caja sin sencillo inicial.
  const amount = raw === "" ? 0 : value;
  if (amount === null) return { values: { amount: raw }, fieldErrors: { amount: "Monto no válido. Ejemplo: 150.00" } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cash_session", { p_opening_amount: amount });
  if (error) return { values: { amount: raw }, ...(CASH_ERRORS[error.message] ?? { error: "No se pudo abrir la caja." }) };

  revalidatePath(`/dashboard/${slug}`, "layout");
  return {};
}

export async function closeCashSession(
  slug: string,
  sessionId: string,
  _: CashFormState,
  formData: FormData,
): Promise<CashFormState> {
  await assertPermission(slug, "cash:operate");
  if (!z.uuid().safeParse(sessionId).success) return { error: "Caja no válida." };

  const { raw, value } = readAmount(formData);
  const note = String(formData.get("note") ?? "").trim();
  const values = { amount: raw, note };
  if (!raw) return { values, fieldErrors: { amount: "Escribe cuánto efectivo contaste." } };
  if (value === null) return { values, fieldErrors: { amount: "Monto no válido. Ejemplo: 150.00" } };
  if (note.length > 300) return { values, fieldErrors: { note: "Usa como máximo 300 caracteres." } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash_session", {
    p_session_id: sessionId,
    p_counted_cash: value,
    p_note: note || null,
  });
  if (error) return { values, ...(CASH_ERRORS[error.message] ?? { error: "No se pudo cerrar la caja." }) };

  revalidatePath(`/dashboard/${slug}`, "layout");
  return {};
}
