import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BILLING, billingPhase, type BillingPhase } from "@/lib/billing";
import { formatMoney } from "@/lib/format";
import { Logo } from "@/components/logo";
import { MetricStrip } from "@/components/ui/metric-strip";
import { Badge } from "@/components/ui/badge";
import { OrgActions, ReviewButtons } from "./admin-client";
import type { BillingMethod } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Administración" };

const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric" });
const METHOD_LABEL: Record<BillingMethod, string> = { card: "Tarjeta", yape: "Yape", plin: "Plin", transfer: "Transferencia" };
const PHASE: Record<BillingPhase | "suspended", { label: string; tone: "ok" | "warn" | "danger" | "accent" | "neutral" }> = {
  paid: { label: "Pagando", tone: "ok" },
  trial: { label: "En prueba", tone: "accent" },
  grace: { label: "En gracia", tone: "warn" },
  provisional: { label: "Provisional", tone: "warn" },
  expired: { label: "Vencido", tone: "danger" },
  suspended: { label: "Suspendido", tone: "neutral" },
};

/** Panel del dueño de la plataforma. Solo para usuarios en private.platform_admins. */
export default async function AdminPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound(); // no revela que la ruta existe

  const [orgs, pending] = await Promise.all([supabase.rpc("admin_organizations"), supabase.rpc("admin_pending_payments")]);
  if (orgs.error) throw new Error(orgs.error.message);
  if (pending.error) throw new Error(pending.error.message);

  // Enlaces temporales (10 min) a los comprobantes privados.
  const receipts = new Map<string, string>();
  await Promise.all(
    (pending.data ?? [])
      .filter((p) => p.receipt_path)
      .map(async (p) => {
        const { data } = await supabase.storage.from("billing-receipts").createSignedUrl(p.receipt_path!, 600);
        if (data?.signedUrl) receipts.set(p.id, data.signedUrl);
      }),
  );

  const rows = (orgs.data ?? []).map((o) => ({
    ...o,
    phase: (o.status === "suspended" || o.status === "canceled" ? "suspended" : billingPhase(o)) as BillingPhase | "suspended",
  }));
  const count = (ph: BillingPhase | "suspended") => rows.filter((r) => r.phase === ph).length;
  const paying = count("paid") + count("grace");

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-10">
        <Logo />
        <Link href="/dashboard" className="text-sm text-ink-2 hover:text-ink">
          Ir a mi panel
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-2 pb-16 sm:px-6 lg:px-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Administración de la plataforma</h1>
          <p className="mt-1 text-sm text-ink-2">Negocios registrados, suscripciones y pagos por confirmar.</p>
        </div>

        <MetricStrip
          metrics={[
            {
              label: "Ingreso mensual estimado",
              value: formatMoney(paying * BILLING.priceSoles),
              primary: true,
              note: `${paying} negocios pagando`,
            },
            { label: "En prueba", value: String(count("trial")) },
            { label: "Vencidos", value: String(count("expired")) },
            { label: "Pagos por revisar", value: String((pending.data ?? []).length) },
          ]}
        />

        <section>
          <h2 className="mb-3 font-semibold">Pagos por confirmar</h2>
          {(pending.data ?? []).length === 0 ? (
            <p className="rounded-panel border border-dashed border-line px-4 py-8 text-center text-sm text-ink-3">
              No hay pagos pendientes. 🎉
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {pending.data!.map((p) => (
                <li key={p.id} className="grid gap-3 rounded-panel border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold [overflow-wrap:anywhere]">{p.organization_name}</p>
                      <p className="text-sm text-ink-2">
                        {METHOD_LABEL[p.method]} · Op. <span className="tabular font-medium text-ink">{p.operation_number}</span>
                      </p>
                      <p className="text-xs text-ink-3">
                        Pagado el {dateFmt.format(new Date(`${p.paid_on}T12:00:00Z`))} · reportado {dateFmt.format(new Date(p.created_at))}
                      </p>
                    </div>
                    <p className="text-right">
                      <span className="block text-lg font-semibold tabular">{formatMoney(p.amount)}</span>
                      <span className="text-xs text-ink-3">
                        {p.months} {p.months === 1 ? "mes" : "meses"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {receipts.has(p.id) ? (
                      <a href={receipts.get(p.id)} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">
                        Ver comprobante
                      </a>
                    ) : (
                      <span className="text-sm text-ink-3">Sin comprobante</span>
                    )}
                    <ReviewButtons paymentId={p.id} label={`${formatMoney(p.amount)} de ${p.organization_name}`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-3">
            Antes de aprobar, verifica en tu banca o app que el número de operación y el monto coincidan.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Negocios ({rows.length})</h2>
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {rows.map((o) => (
              <li key={o.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="[overflow-wrap:anywhere]">{o.name}</span>
                    <Badge tone={PHASE[o.phase].tone}>{PHASE[o.phase].label}</Badge>
                    {o.subscription_status === "authorized" && <Badge tone="ok">Tarjeta</Badge>}
                    {o.pending_payments > 0 && <Badge tone="warn">Pago por revisar</Badge>}
                  </p>
                  <p className="truncate text-xs text-ink-3">
                    /{o.slug} · {o.owner_email ?? "sin propietario"} · alta {dateFmt.format(new Date(o.created_at))} · acceso hasta{" "}
                    {dateFmt.format(new Date(o.access_until))}
                  </p>
                </div>
                <OrgActions orgId={o.id} name={o.name} suspended={o.phase === "suspended"} />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
