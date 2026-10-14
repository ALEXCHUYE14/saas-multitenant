import type { Metadata } from "next";
import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_LABEL, formatCents, formatMoney, toCents } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { MetricStrip } from "@/components/ui/metric-strip";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { CloseCashForm, OpenCashForm } from "./cash-forms";
import type { CashSession } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Caja" };

const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function CashPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await getTenantContext(slug, { require: "cash:operate" });
  const supabase = await createClient();

  const [{ data: open, error }, history, team] = await Promise.all([
    supabase.from("cash_sessions").select("*").is("closed_at", null).maybeSingle(),
    supabase.from("cash_sessions").select("*").not("closed_at", "is", null).order("closed_at", { ascending: false }).limit(15),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (error) throw new Error(error.message);
  const names = new Map((team.data ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <PageHeader title="Caja" description="Abre la caja al empezar el turno y ciérrala contando el efectivo." />

      {open ? <OpenSession slug={slug} session={open} openedBy={open.opened_by ? names.get(open.opened_by) : null} /> : <OpenCashForm />}

      <section className="mt-10">
        <h2 className="mb-3 font-semibold">Cierres anteriores</h2>
        <DataTable
          caption="Cierres de caja"
          rows={history.data ?? []}
          rowKey={(s) => s.id}
          columns={[
            { key: "closed", header: "Cierre", cell: (s) => dateFmt.format(new Date(s.closed_at!)) },
            { key: "who", header: "Cerró", hideOnMobile: true, cell: (s) => (s.closed_by ? names.get(s.closed_by) : null) ?? "—" },
            { key: "expected", header: "Esperado", align: "right", cell: (s) => formatMoney(s.expected_cash) },
            { key: "counted", header: "Contado", align: "right", cell: (s) => formatMoney(s.counted_cash) },
            { key: "diff", header: "Diferencia", align: "right", cell: (s) => <Difference session={s} /> },
          ]}
          mobileRow={(s) => ({
            title: dateFmt.format(new Date(s.closed_at!)),
            meta: `Esperado ${formatMoney(s.expected_cash)} · Contado ${formatMoney(s.counted_cash)}`,
            aside: <Difference session={s} />,
          })}
          empty={<EmptyState title="Aún no hay cierres" description="Cuando cierres tu primera caja aparecerá aquí." />}
        />
      </section>
    </>
  );
}

function Difference({ session }: { session: CashSession }) {
  const diff = toCents(session.counted_cash ?? 0) - toCents(session.expected_cash ?? 0);
  if (diff === 0) return <span className="text-ink-3">Cuadra</span>;
  return <span className={diff > 0 ? "text-ok" : "text-danger"}>{(diff > 0 ? "+" : "−") + formatCents(Math.abs(diff))}</span>;
}

async function OpenSession({ slug, session, openedBy }: { slug: string; session: CashSession; openedBy?: string | null }) {
  const supabase = await createClient();
  const [{ data: summary, error }, debtPayments] = await Promise.all([
    supabase.rpc("cash_session_summary", { p_session_id: session.id }),
    // Abonos de fiado (si la migración de fiados aún no está aplicada, queda vacío).
    supabase.rpc("cash_session_payments_summary", { p_session_id: session.id }),
  ]);
  if (error) throw new Error(error.message);
  const payRows = debtPayments.data ?? [];
  const payCashCents = toCents(payRows.find((r) => r.payment_method === "cash")?.total ?? 0);
  const payTotalCents = payRows.reduce((acc, r) => acc + toCents(r.total), 0);

  const rows = summary ?? [];
  const totalCents = rows.reduce((acc, r) => acc + toCents(r.total), 0);
  const count = rows.reduce((acc, r) => acc + Number(r.sales_count), 0);
  const cashCents = toCents(rows.find((r) => r.payment_method === "cash")?.total ?? 0);
  // Igual que close_cash_session: inicial + ventas en efectivo + abonos en efectivo.
  const expectedCents = toCents(session.opening_amount) + cashCents + payCashCents;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <div className="grid gap-6">
        <MetricStrip
          metrics={[
            { label: "Vendido en este turno", value: formatCents(totalCents), primary: true, note: `${count} ventas` },
            { label: "Efectivo esperado en cajón", value: formatCents(expectedCents), note: `Incluye ${formatMoney(session.opening_amount)} inicial` },
            ...(payRows.length > 0 ? [{ label: "Abonos de fiado cobrados", value: formatCents(payTotalCents) }] : []),
          ]}
        />
        <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <h2 className="font-semibold">Por medio de pago</h2>
          <p className="mt-1 text-sm text-ink-2">
            Abierta {dateFmt.format(new Date(session.opened_at))}
            {openedBy ? ` por ${openedBy}` : ""}.{" "}
            <Link href={`/dashboard/${slug}/sales?session=${session.id}`} className="underline underline-offset-4 hover:text-ink">
              Ver ventas del turno
            </Link>
          </p>
          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-ink-3">Aún no hay ventas en este turno.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line text-sm">
              {rows.map((r) => (
                <li key={r.payment_method} className="flex justify-between py-2.5">
                  <span>
                    {PAYMENT_LABEL[r.payment_method]} <span className="text-ink-3">· {r.sales_count}</span>
                  </span>
                  <span className="tabular font-medium">{formatMoney(r.total)}</span>
                </li>
              ))}
            </ul>
          )}
          {payRows.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold">Abonos de fiado</h3>
              <ul className="mt-2 divide-y divide-line text-sm">
                {payRows.map((r) => (
                  <li key={r.payment_method} className="flex justify-between py-2.5">
                    <span>
                      {PAYMENT_LABEL[r.payment_method]} <span className="text-ink-3">· {r.payments_count}</span>
                    </span>
                    <span className="tabular font-medium">{formatMoney(r.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {rows.some((r) => r.payment_method === "credit") && (
            <p className="mt-4 text-xs text-ink-3">Las ventas al fiado no entran al cajón: se cobran después como abonos.</p>
          )}
        </section>
      </div>
      <CloseCashForm sessionId={session.id} expectedCents={expectedCents} />
    </div>
  );
}
