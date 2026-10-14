import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";
import { PAYMENT_LABEL, formatMoney, toCents } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { MetricStrip } from "@/components/ui/metric-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { PaymentForm, VoidPaymentButton } from "./credit-forms";

export const metadata: Metadata = { title: "Cliente" };

const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Entry =
  | { kind: "sale"; id: string; at: string; amount: number; label: string; voided: boolean; detail: string | null }
  | { kind: "payment"; id: string; at: string; amount: number; label: string; voided: boolean; detail: string | null };

export default async function CustomerPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug, { require: "customers:read" });
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: customer, error }, balance, sales, payments] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.rpc("customer_balance", { p_customer_id: id }),
    supabase
      .from("sales")
      .select("id, number, total, payment_method, status, created_at, void_reason")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("customer_payments").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (error) throw new Error(error.message);
  if (!customer) notFound();

  const debt = balance.data ?? 0;
  const debtCents = toCents(debt);
  const canCollect = can(ctx.role, "credit:collect");
  const canVoid = can(ctx.role, "credit:void");

  const entries: Entry[] = [
    ...(sales.data ?? []).map(
      (s): Entry => ({
        kind: "sale",
        id: s.id,
        at: s.created_at,
        amount: s.total,
        label: `Venta #${s.number} · ${PAYMENT_LABEL[s.payment_method]}`,
        voided: s.status === "voided",
        detail: s.status === "voided" ? `Anulada: ${s.void_reason ?? ""}` : null,
      }),
    ),
    ...(payments.data ?? []).map(
      (p): Entry => ({
        kind: "payment",
        id: p.id,
        at: p.created_at,
        amount: p.amount,
        label: `Abono · ${PAYMENT_LABEL[p.payment_method]}`,
        voided: p.voided_at !== null,
        detail: p.voided_at ? `Anulado: ${p.void_reason ?? ""}` : p.note,
      }),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <Link href={`/dashboard/${slug}/customers`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" />
        Clientes
      </Link>

      <PageHeader
        title={customer.full_name}
        description={[customer.document_id, customer.phone, customer.email].filter(Boolean).join(" · ") || undefined}
      />

      <MetricStrip
        metrics={[
          {
            label: debtCents < 0 ? "Saldo a favor" : "Deuda (fiado)",
            value: formatMoney(Math.abs(debt)),
            primary: true,
            note: debtCents === 0 ? "Al día" : undefined,
          },
          { label: "Compras registradas", value: String((sales.data ?? []).filter((s) => s.status === "completed").length) },
        ]}
      />

      <div className={cn("mt-8 grid gap-6", canCollect && debtCents > 0 && "lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start")}>
        <section className="min-w-0">
          <h2 className="mb-3 font-semibold">Movimientos</h2>
          {entries.length === 0 ? (
            <EmptyState title="Sin movimientos" description="Aquí verás sus compras y abonos." />
          ) : (
            <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
              {entries.map((e) => (
                <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {e.kind === "sale" ? (
                        <Link href={`/dashboard/${slug}/sales/${e.id}`} className="hover:underline">
                          {e.label}
                        </Link>
                      ) : (
                        e.label
                      )}
                      {e.voided && (
                        <Badge tone="danger" className="ml-2">
                          Anulado
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-3">{[dateFmt.format(new Date(e.at)), e.detail].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span
                    className={cn(
                      "tabular text-sm font-medium",
                      e.voided ? "text-ink-3 line-through" : e.kind === "payment" ? "text-ok" : undefined,
                    )}
                  >
                    {e.kind === "payment" ? "−" : ""}
                    {formatMoney(e.amount)}
                  </span>
                  {e.kind === "payment" && !e.voided && canVoid && <VoidPaymentButton paymentId={e.id} amount={e.amount} />}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-3">Solo las ventas al fiado suman a la deuda; las demás se muestran como historial.</p>
        </section>

        {canCollect && debtCents > 0 && <PaymentForm customerId={customer.id} debt={debt} />}
      </div>
    </>
  );
}
