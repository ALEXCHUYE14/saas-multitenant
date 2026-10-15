"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BILLING } from "@/lib/billing";
import { parseDecimal } from "@/lib/format";
import { cancelPreapproval, createPreapproval, mercadoPagoEnabled } from "@/lib/mercadopago";

/** Negocio del usuario (aunque esté vencido), solo si es el propietario. */
async function requireOwner() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("No autorizado");
  const { data } = await supabase.rpc("my_billing");
  const b = data?.[0];
  if (!b || !b.is_owner) throw new Error("Solo el propietario puede gestionar la suscripción.");
  return { supabase, billing: b, user: auth.user };
}

async function siteOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin") ?? "";
}

// -----------------------------------------------------------------------------
// Tarjeta: Mercado Pago Suscripciones (cobro mensual automático)
// -----------------------------------------------------------------------------
export type CardState = { error?: string; email?: string };

export async function startCardSubscription(_: CardState, formData: FormData): Promise<CardState> {
  const { billing, user } = await requireOwner();
  const email = String(formData.get("payer_email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { email, error: "Escribe el correo de tu cuenta de Mercado Pago." };
  if (!mercadoPagoEnabled()) return { email, error: "El pago con tarjeta aún no está disponible. Usa Yape, Plin o transferencia." };

  let initPoint: string | undefined;
  try {
    const pre = await createPreapproval({
      orgId: billing.organization_id,
      orgName: billing.name,
      payerEmail: email,
      amount: BILLING.priceSoles,
      backUrl: `${await siteOrigin()}/billing?mp=1`,
    });
    initPoint = pre.init_point;

    // Registro inicial (pendiente); el webhook lo actualiza cuando autorice.
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await createAdminClient().rpc("billing_upsert_subscription", {
        p_org: billing.organization_id,
        p_provider_id: pre.id,
        p_status: pre.status ?? "pending",
        p_payer_email: email,
      });
    }
  } catch (err) {
    console.error("[billing] createPreapproval", user.id, err);
    return { email, error: "Mercado Pago no respondió. Inténtalo de nuevo en unos minutos." };
  }

  // Solo se redirige a dominios de Mercado Pago (evita open redirect si la respuesta fuera rara).
  let target: URL;
  try {
    target = new URL(initPoint ?? "");
  } catch {
    return { email, error: "Mercado Pago devolvió un enlace no válido." };
  }
  if (target.protocol !== "https:" || !/(^|\.)mercadopago\.com(\.[a-z]{2})?$/.test(target.hostname))
    return { email, error: "Mercado Pago devolvió un enlace no válido." };

  redirect(target.toString());
}

export async function cancelCardSubscription(): Promise<{ error?: string }> {
  const { supabase, billing } = await requireOwner();
  const { data: sub } = await supabase
    .from("billing_subscriptions")
    .select("provider_subscription_id, status")
    .eq("organization_id", billing.organization_id)
    .maybeSingle();
  if (!sub || sub.status === "cancelled") return { error: "No tienes una suscripción con tarjeta activa." };

  try {
    const pre = await cancelPreapproval(sub.provider_subscription_id);
    await createAdminClient().rpc("billing_upsert_subscription", {
      p_org: billing.organization_id,
      p_provider_id: pre.id,
      p_status: pre.status ?? "cancelled",
    });
  } catch (err) {
    console.error("[billing] cancelPreapproval", err);
    return { error: "No se pudo cancelar en Mercado Pago. Inténtalo de nuevo." };
  }
  revalidatePath("/billing");
  return {};
}

// -----------------------------------------------------------------------------
// Yape / Plin / transferencia: reporte de pago
// -----------------------------------------------------------------------------
export type ReportState = {
  error?: string;
  saved?: boolean;
  fieldErrors?: Partial<Record<"method" | "operation" | "paid_on" | "amount" | "receipt", string>>;
  values?: Record<string, string>;
};

const REPORT_ERRORS: Record<string, ReportState> = {
  forbidden: { error: "Solo el propietario puede reportar pagos." },
  invalid_method: { fieldErrors: { method: "Elige cómo pagaste." } },
  invalid_operation: { fieldErrors: { operation: "Número de operación no válido (4 a 30 letras o números)." } },
  invalid_date: { fieldErrors: { paid_on: "La fecha no puede ser futura ni de hace más de 30 días." } },
  invalid_amount: { fieldErrors: { amount: `El monto mínimo es ${BILLING.priceLabel} (máximo 12 meses).` } },
  invalid_receipt: { fieldErrors: { receipt: "Comprobante no válido." } },
  pending_exists: { error: "Ya tienes un pago en revisión. Te avisaremos cuando se confirme." },
  operation_used: { fieldErrors: { operation: "Ese número de operación ya fue registrado." } },
};

const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export async function reportManualPayment(_: ReportState, formData: FormData): Promise<ReportState> {
  const { supabase, billing } = await requireOwner();

  const values = {
    method: String(formData.get("method") ?? ""),
    operation: String(formData.get("operation") ?? "").trim().toUpperCase(),
    paid_on: String(formData.get("paid_on") ?? ""),
    amount: String(formData.get("amount") ?? "").trim(),
  };
  const fieldErrors: ReportState["fieldErrors"] = {};

  if (!["yape", "plin", "transfer"].includes(values.method)) fieldErrors.method = "Elige cómo pagaste.";
  if (!/^[A-Z0-9-]{4,30}$/.test(values.operation)) fieldErrors.operation = "Número de operación no válido (4 a 30 letras o números).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.paid_on)) fieldErrors.paid_on = "Indica la fecha del pago.";
  const amount = parseDecimal(values.amount, 2, 6);
  if (amount === null || amount < BILLING.priceSoles) fieldErrors.amount = `El monto mínimo es ${BILLING.priceLabel}.`;

  const file = formData.get("receipt");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile) {
    if (!RECEIPT_TYPES[file.type]) fieldErrors.receipt = "Sube una imagen (JPG, PNG, WEBP) o un PDF.";
    else if (file.size > MAX_RECEIPT_BYTES) fieldErrors.receipt = "El archivo pesa más de 5 MB.";
  }

  if (Object.keys(fieldErrors).length) return { values, fieldErrors };

  // 1) Comprobante (opcional) en la carpeta privada del negocio.
  let receiptPath: string | null = null;
  if (hasFile) {
    receiptPath = `${billing.organization_id}/${crypto.randomUUID()}.${RECEIPT_TYPES[file.type]}`;
    const { error: upErr } = await supabase.storage
      .from("billing-receipts")
      .upload(receiptPath, file, { contentType: file.type, upsert: false });
    if (upErr) return { values, fieldErrors: { receipt: "No se pudo subir el comprobante. Inténtalo de nuevo." } };
  }

  // 2) Reporte. Si falla, se borra el comprobante recién subido.
  const { error } = await supabase.rpc("report_manual_payment", {
    p_method: values.method as "yape" | "plin" | "transfer",
    p_operation_number: values.operation,
    p_paid_on: values.paid_on,
    p_amount: amount!,
    p_receipt_path: receiptPath,
  });

  if (error) {
    if (receiptPath && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await createAdminClient().storage.from("billing-receipts").remove([receiptPath]).catch(() => undefined);
    }
    return { values, ...(REPORT_ERRORS[error.message] ?? { error: "No se pudo registrar el pago. Inténtalo de nuevo." }) };
  }

  revalidatePath("/billing");
  revalidatePath("/dashboard", "layout");
  return { saved: true };
}
