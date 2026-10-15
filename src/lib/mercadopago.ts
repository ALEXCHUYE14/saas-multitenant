import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cliente mínimo de Mercado Pago (Suscripciones / preapproval).
 * Variables: MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET.
 * Nunca se confía en el cuerpo del webhook: siempre se consulta el recurso a la API.
 */
const API = "https://api.mercadopago.com";

export function mercadoPagoEnabled(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

async function mp<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MercadoPagoError(res.status, `Mercado Pago ${init.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export class MercadoPagoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Preapproval = {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  external_reference?: string | null;
  payer_email?: string | null;
  init_point?: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string };
};

export type AuthorizedPayment = {
  id: number | string;
  preapproval_id?: string;
  status?: string;
  payment?: { id?: number | string; status?: string } | null;
};

export type Payment = {
  id: number | string;
  status: string; // approved | pending | rejected | refunded | ...
  currency_id: string;
  transaction_amount: number;
  date_approved?: string | null;
  metadata?: { preapproval_id?: string } | null;
};

export function createPreapproval(input: {
  orgId: string;
  orgName: string;
  payerEmail: string;
  amount: number;
  backUrl: string;
}): Promise<Preapproval> {
  return mp<Preapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `Suscripción mensual · ${input.orgName}`.slice(0, 120),
      external_reference: input.orgId,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.amount,
        currency_id: "PEN",
      },
    }),
  });
}

export const getPreapproval = (id: string) => mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);

export const cancelPreapproval = (id: string) =>
  mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });

export const getAuthorizedPayment = (id: string) => mp<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`);

export const getPayment = (id: string) => mp<Payment>(`/v1/payments/${encodeURIComponent(id)}`);

/**
 * Verifica la cabecera x-signature de Mercado Pago:
 *   x-signature: ts=<epoch>,v1=<hmac-sha256 hex>
 *   manifest:    id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * data.id alfanumérico va en minúsculas. Sin ventana de tiempo: Mercado Pago
 * reintenta avisos más tarde, y repetir uno es inofensivo (se consulta la API y
 * cada cobro se registra una sola vez).
 */
export function verifyWebhookSignature(params: {
  signature: string | null;
  requestId: string | null;
  dataId: string;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret || !params.signature) return false;

  const parts = Object.fromEntries(
    params.signature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return false;

  const id = /^[a-z0-9]+$/i.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId;
  let manifest = `id:${id};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
