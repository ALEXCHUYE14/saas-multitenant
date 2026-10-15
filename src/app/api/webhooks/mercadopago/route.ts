import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { BILLING } from "@/lib/billing";
import {
  getAuthorizedPayment,
  getPayment,
  getPreapproval,
  MercadoPagoError,
  verifyWebhookSignature,
  type Payment,
} from "@/lib/mercadopago";

/**
 * Webhook de Mercado Pago (Suscripciones). Configúralo en tu panel de Mercado Pago
 * → Tus integraciones → Webhooks con los eventos "Planes y suscripciones" y "Pagos":
 *   https://<tu-dominio>/api/webhooks/mercadopago
 *
 * Reglas:
 *  - Sin firma válida (x-signature) → 401. Nunca se confía en el cuerpo: se consulta la API.
 *  - Un cobro solo extiende el acceso si está "approved", en PEN y ≥ S/ 35.
 *  - Idempotente: el mismo pago avisado varias veces se cuenta una sola vez (BD).
 *  - Error transitorio → 500, para que Mercado Pago reintente.
 */
export const dynamic = "force-dynamic";

const uuid = z.uuid();

export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  let body: { type?: string; topic?: string; data?: { id?: string | number } } = {};
  try {
    body = await request.json();
  } catch {
    // Algunos avisos llegan sin cuerpo: se usan los parámetros de la URL.
  }

  const type = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body.type ?? body.topic ?? "";
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : "");

  if (!type || !/^[A-Za-z0-9_-]{1,64}$/.test(dataId)) {
    return NextResponse.json({ ignored: "aviso sin tipo o id" }, { status: 200 });
  }

  if (
    !verifyWebhookSignature({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
    })
  ) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  try {
    switch (type) {
      case "subscription_preapproval":
        await syncPreapproval(dataId);
        break;
      case "subscription_authorized_payment": {
        const ap = await getAuthorizedPayment(dataId);
        const paymentId = ap.payment?.id;
        if (paymentId != null && ap.payment?.status === "approved") await creditPayment(String(paymentId), ap.preapproval_id);
        break;
      }
      case "payment":
        await creditPayment(dataId);
        break;
      default:
        // Otros eventos no afectan el acceso.
        break;
    }
  } catch (err) {
    // Recurso inexistente (p. ej. "Simular notificación" del panel de Mercado Pago, que
    // usa ids ficticios): no es un error temporal, reintentar no sirve → 200.
    if (err instanceof MercadoPagoError && err.status === 404) {
      return NextResponse.json({ ignored: "recurso no encontrado en Mercado Pago" }, { status: 200 });
    }
    console.error("[mercadopago webhook]", type, dataId, err);
    return NextResponse.json({ error: "error temporal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

/** Guarda el estado de la suscripción (authorized, paused, cancelled…). */
async function syncPreapproval(preapprovalId: string) {
  const pre = await getPreapproval(preapprovalId);
  const orgId = pre.external_reference ?? "";
  if (!uuid.safeParse(orgId).success) return; // no es una suscripción de esta plataforma

  const admin = createAdminClient();
  const { error } = await admin.rpc("billing_upsert_subscription", {
    p_org: orgId,
    p_provider_id: pre.id,
    p_status: pre.status,
    p_payer_email: pre.payer_email ?? null,
  });
  if (error && error.code !== "23503") throw new Error(error.message); // 23503: el negocio ya no existe
}

/** Registra un cobro aprobado y extiende un mes (una sola vez por pago). */
async function creditPayment(paymentId: string, preapprovalId?: string) {
  const pay: Payment = await getPayment(paymentId);
  if (pay.status !== "approved") return;
  if (pay.currency_id !== "PEN" || !(pay.transaction_amount >= BILLING.priceSoles)) return;

  const preId = preapprovalId ?? pay.metadata?.preapproval_id;
  if (!preId) return; // pago que no es de una suscripción

  const pre = await getPreapproval(preId);
  const orgId = pre.external_reference ?? "";
  if (!uuid.safeParse(orgId).success) return;

  const admin = createAdminClient();
  const { error } = await admin.rpc("billing_apply_card_payment", {
    p_org: orgId,
    p_provider_payment_id: String(pay.id),
    p_amount: pay.transaction_amount,
    p_paid_at: pay.date_approved ?? null,
  });
  if (error && error.code !== "23503") throw new Error(error.message);

  await syncPreapproval(preId);
}
