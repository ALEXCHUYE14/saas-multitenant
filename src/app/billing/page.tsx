import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, Landmark, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/actions";
import { BILLING, billingPhase, daysLeft } from "@/lib/billing";
import { toLimaDateString } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { mercadoPagoEnabled } from "@/lib/mercadopago";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { FormAlert } from "@/components/ui/form-alert";
import { CancelCardButton, CardSubscribeForm, CopyField, ReportPaymentForm } from "./billing-forms";
import type { BillingMethod, BillingPaymentStatus } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Suscripción" };

const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long", year: "numeric" });
const METHOD_LABEL: Record<BillingMethod, string> = { card: "Tarjeta", yape: "Yape", plin: "Plin", transfer: "Transferencia" };
const STATUS: Record<BillingPaymentStatus, { label: string; tone: "ok" | "warn" | "danger" }> = {
  approved: { label: "Confirmado", tone: "ok" },
  pending: { label: "En revisión", tone: "warn" },
  rejected: { label: "Rechazado", tone: "danger" },
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ mp?: string }> }) {
  const { mp } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/billing");

  const { data, error } = await supabase.rpc("my_billing");
  if (error) throw new Error(error.message);
  const b = data?.[0];
  if (!b) redirect("/onboarding");

  const [payments, sub] = b.is_owner
    ? await Promise.all([
        // Filtro explícito: un administrador de la plataforma puede leer los de todos (RLS).
        supabase
          .from("billing_payments")
          .select("*")
          .eq("organization_id", b.organization_id)
          .order("created_at", { ascending: false })
          .limit(24),
        supabase.from("billing_subscriptions").select("*").eq("organization_id", b.organization_id).maybeSingle(),
      ])
    : [null, null];

  const phase = billingPhase(b);
  const until = new Date(b.access_until);
  const left = daysLeft(until);
  const suspended = b.status === "suspended" || b.status === "canceled";
  const cardActive = sub?.data && ["authorized", "pending"].includes(sub.data.status);
  const manualMethods = [
    ...(BILLING.yapeNumber ? [{ value: "yape", label: "Yape" }] : []),
    ...(BILLING.plinNumber ? [{ value: "plin", label: "Plin" }] : []),
    { value: "transfer", label: "Transferencia bancaria" },
  ];

  const headline = suspended
    ? "Este negocio está suspendido"
    : phase === "expired"
      ? "Tu acceso venció"
      : phase === "trial"
        ? `Prueba gratis: te quedan ${left} ${left === 1 ? "día" : "días"}`
        : phase === "paid"
          ? "Suscripción activa"
          : phase === "grace"
            ? `Pago pendiente: te quedan ${left} ${left === 1 ? "día" : "días"} de gracia`
            : "Acceso provisional mientras confirmamos tu pago";

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          {b.has_access && (
            <Link href={`/dashboard/${b.slug}`} className="font-medium text-ink underline decoration-accent decoration-2 underline-offset-4">
              Ir a mi panel
            </Link>
          )}
          <form action={logout}>
            <button className="text-ink-2 hover:text-ink">Salir</button>
          </form>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-4 pb-16 sm:px-6">
        {mp && (
          <FormAlert notice="Recibimos tu suscripción de Mercado Pago. En cuanto se confirme el cobro (normalmente en 1 o 2 minutos) se activa tu acceso. Puedes recargar esta página." />
        )}

        {/* Estado */}
        <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
          <p className="text-sm text-ink-2">{b.name}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{headline}</h1>
          {!suspended && phase !== "expired" && (
            <p className="mt-1 text-sm text-ink-2">Acceso hasta el {dateFmt.format(until)}.</p>
          )}
          {suspended ? (
            <p className="mt-2 text-sm text-ink-2">Tus datos están guardados. Escríbenos para reactivar tu cuenta.</p>
          ) : (
            <p className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular">{BILLING.priceLabel}</span>
              <span className="text-ink-2">al mes por negocio · todo incluido</span>
            </p>
          )}
          {b.pending_payment && (
            <p className="mt-4 rounded-control bg-warn/10 px-3 py-2.5 text-sm">
              Tienes un pago en revisión. Mientras tanto puedes seguir usando el sistema.
            </p>
          )}
        </section>

        {!b.is_owner ? (
          <p className="text-sm text-ink-2">
            Solo el propietario del negocio puede pagar la suscripción. Pídele que ingrese a esta página.
          </p>
        ) : suspended ? null : (
          <>
            {/* Tarjeta (automático) */}
            {mercadoPagoEnabled() && (
              <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
                <h2 className="flex items-center gap-2 font-semibold">
                  <CreditCard className="size-5 text-accent" />
                  Tarjeta de crédito o débito
                  <Badge tone="accent">Recomendado</Badge>
                </h2>
                <p className="mt-1 mb-5 text-sm text-ink-2">
                  Se cobra solo cada mes y tu acceso se renueva automáticamente. Cancela cuando quieras.
                </p>
                {cardActive ? (
                  <div className="grid gap-3 text-sm">
                    <p>
                      Cobro automático{" "}
                      <span className="font-medium">{sub!.data!.status === "authorized" ? "activo" : "pendiente de confirmación"}</span>
                      {sub!.data!.payer_email ? ` (${sub!.data!.payer_email})` : ""}.
                    </p>
                    <CancelCardButton />
                  </div>
                ) : (
                  <CardSubscribeForm defaultEmail={auth.user.email ?? ""} />
                )}
              </section>
            )}

            {/* Yape / Plin / transferencia */}
            <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
              <h2 className="flex items-center gap-2 font-semibold">
                {BILLING.yapeNumber || BILLING.plinNumber ? (
                  <Smartphone className="size-5 text-accent" />
                ) : (
                  <Landmark className="size-5 text-accent" />
                )}
                {BILLING.yapeNumber || BILLING.plinNumber ? "Yape, Plin o transferencia" : "Transferencia bancaria"}
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                Paga {BILLING.priceLabel} (o varios meses) y reporta el pago abajo. Tienes acceso inmediato mientras lo
                confirmamos.
              </p>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {BILLING.yapeNumber && <CopyField label="Yape" value={BILLING.yapeNumber} />}
                {BILLING.plinNumber && <CopyField label="Plin" value={BILLING.plinNumber} />}
                <CopyField label={`${BILLING.bank.name} · ${BILLING.bank.accountType}`} value={BILLING.bank.account} />
                <CopyField label="CCI (desde otros bancos)" value={BILLING.bank.cci} />
              </div>
              <p className="mt-2 text-xs text-ink-3">Titular: {BILLING.bank.holder}</p>

              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-4 text-sm font-semibold">Reportar mi pago</h3>
                {b.pending_payment ? (
                  <p className="text-sm text-ink-2">Ya tienes un pago en revisión. Podrás reportar otro cuando se confirme.</p>
                ) : (
                  <ReportPaymentForm methods={manualMethods} today={toLimaDateString(new Date())} />
                )}
              </div>
            </section>

            {/* Historial */}
            {(payments?.data ?? []).length > 0 && (
              <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
                <h2 className="mb-3 font-semibold">Historial de pagos</h2>
                <ul className="divide-y divide-line text-sm">
                  {payments!.data!.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {METHOD_LABEL[p.method]} · {formatMoney(p.amount)}
                          {p.months > 1 && <span className="text-ink-3"> ({p.months} meses)</span>}
                        </p>
                        <p className="text-xs text-ink-3">
                          {dateFmt.format(new Date(p.created_at))}
                          {p.operation_number && ` · Op. ${p.operation_number}`}
                          {p.status === "approved" && p.period_end && ` · cubre hasta el ${dateFmt.format(new Date(p.period_end))}`}
                          {p.status === "rejected" && p.reject_reason && ` · ${p.reject_reason}`}
                        </p>
                      </div>
                      <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
