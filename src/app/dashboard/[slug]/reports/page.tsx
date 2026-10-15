import type { Metadata } from "next";
import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";
import { RANGE_PRESETS, resolveRange, toLimaDateString, type RangePreset } from "@/lib/dates";
import { PAYMENT_LABEL, formatCents, formatQty, toCents } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { MetricStrip } from "@/components/ui/metric-strip";
import { FormAlert } from "@/components/ui/form-alert";
import { SalesChart, type ChartPoint } from "./sales-chart";

export const metadata: Metadata = { title: "Reportes" };

const DAY_MS = 86_400_000;
const dayShort = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short" });
const dayLong = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" });
const monthFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", month: "short", year: "numeric" });

type SP = Promise<{ range?: string; from?: string; to?: string }>;

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  await getTenantContext(slug, { require: "reports:read", onForbidden: "redirect" });
  const range = resolveRange(await searchParams);
  const args = { p_from: range.from.toISOString(), p_to: range.to.toISOString() };

  const supabase = await createClient();
  const [summary, byDay, methods, top, profit, sellers, team] = await Promise.all([
    supabase.rpc("report_summary", args),
    supabase.rpc("report_sales_by_day", args),
    supabase.rpc("report_payment_methods", args),
    supabase.rpc("report_top_products", { ...args, p_limit: 15 }),
    supabase.rpc("report_profit", args),
    supabase.rpc("report_by_seller", args),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const failed = [summary, byDay, methods, top, profit, sellers].find((r) => r.error);
  if (failed?.error) {
    return (
      <>
        <PageHeader title="Reportes" />
        <FormAlert error="No se pudieron cargar los reportes. Verifica que la migración de reportes esté aplicada en Supabase." />
      </>
    );
  }

  const s = summary.data?.[0];
  const netCents = toCents(s?.net ?? 0);
  const count = Number(s?.sales_count ?? 0);
  const avgCents = count > 0 ? Math.round(netCents / count) : 0;
  const p = profit.data?.[0];
  const withCostCents = toCents(p?.revenue_with_cost ?? 0);
  const profitCents = withCostCents - toCents(p?.cost ?? 0);
  const coverage = toCents(p?.revenue ?? 0) > 0 ? Math.round((withCostCents / toCents(p!.revenue)) * 100) : 0;

  // --- Serie por día (o por mes si el rango es largo), con días sin ventas en 0 --
  const days = Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS);
  const totals = new Map((byDay.data ?? []).map((d) => [d.day, { cents: toCents(d.total), count: Number(d.sales_count) }]));
  const daily: ChartPoint[] = Array.from({ length: days }, (_, i) => {
    const key = toLimaDateString(new Date(range.from.getTime() + i * DAY_MS));
    const date = new Date(`${key}T00:00:00Z`);
    const v = totals.get(key) ?? { cents: 0, count: 0 };
    return { key, label: dayShort.format(date), longLabel: dayLong.format(date), ...v };
  });
  let points = daily;
  if (days > 62) {
    const months = new Map<string, ChartPoint>();
    for (const d of daily) {
      const key = d.key.slice(0, 7);
      const label = monthFmt.format(new Date(`${key}-01T00:00:00Z`));
      const m = months.get(key) ?? { key, label, longLabel: label, cents: 0, count: 0 };
      m.cents += d.cents;
      m.count += d.count;
      months.set(key, m);
    }
    points = [...months.values()];
  }

  const names = new Map((team.data ?? []).map((t) => [t.id, t.full_name]));
  const methodRows = methods.data ?? [];
  const methodMax = Math.max(1, ...methodRows.map((m) => toCents(m.total)));
  const topRows = top.data ?? [];
  const topMax = Math.max(1, ...topRows.map((t) => toCents(t.revenue)));

  const base = `/dashboard/${slug}/reports`;

  return (
    <>
      <PageHeader title="Reportes" description="Cómo le va a tu negocio en el periodo que elijas." />

      {/* Filtros: una fila arriba; afectan a todo lo de abajo. */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Periodo" className="flex flex-wrap gap-1 rounded-control bg-surface-2 p-0.5 text-sm">
          {(Object.keys(RANGE_PRESETS) as RangePreset[]).map((k) => (
            <Link
              key={k}
              href={`${base}?range=${k}`}
              aria-current={range.preset === k ? "page" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-[0.375rem] px-3 whitespace-nowrap text-ink-2 hover:text-ink",
                range.preset === k && "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]",
              )}
            >
              {RANGE_PRESETS[k]}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="grid min-w-0 flex-1 gap-1 sm:flex-none">
            <span className="text-xs text-ink-3">Desde</span>
            <input type="date" name="from" defaultValue={range.fromDate} required className="h-10 w-full rounded-control border border-line bg-surface px-2 text-base sm:h-9 sm:text-sm" />
          </label>
          <label className="grid min-w-0 flex-1 gap-1 sm:flex-none">
            <span className="text-xs text-ink-3">Hasta</span>
            <input type="date" name="to" defaultValue={range.toDate} required className="h-10 w-full rounded-control border border-line bg-surface px-2 text-base sm:h-9 sm:text-sm" />
          </label>
          <button className="h-10 rounded-control border border-line px-4 text-ink-2 hover:text-ink sm:h-9">Ver</button>
        </form>
      </div>

      {range.error && (
        <div className="mb-6">
          <FormAlert error={`${range.error} Se muestran los últimos 7 días.`} />
        </div>
      )}

      <MetricStrip
        metrics={[
          { label: "Vendido", value: formatCents(netCents), primary: true, note: s && s.discounts > 0 ? `Descuentos: ${formatCents(toCents(s.discounts))}` : undefined },
          { label: "Ventas", value: String(count), note: s && s.voided_count > 0 ? `${s.voided_count} anuladas` : undefined },
          { label: "Ticket promedio", value: count > 0 ? formatCents(avgCents) : "—" },
          withCostCents > 0
            ? {
                label: "Ganancia estimada",
                value: formatCents(profitCents),
                note: `Margen ${Math.round((profitCents / withCostCents) * 100)}% · ${coverage}% de lo vendido tiene costo`,
              }
            : { label: "Ganancia estimada", value: "—", note: "Registra el costo de tus productos" },
        ]}
      />
      {s && s.credit_total > 0 && (
        <p className="mt-2 text-xs text-ink-3">Incluye {formatCents(toCents(s.credit_total))} vendidos al fiado (por cobrar).</p>
      )}

      <section className="mt-8 rounded-panel border border-line bg-surface p-4 sm:p-6">
        <h2 className="font-semibold">Ventas por {days > 62 ? "mes" : "día"}</h2>
        <p className="mb-4 text-sm text-ink-2">
          Del {range.fromDate.split("-").reverse().join("/")} al {range.toDate.split("-").reverse().join("/")}
        </p>
        <SalesChart points={points} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <h2 className="mb-4 font-semibold">Por medio de pago</h2>
          {methodRows.length === 0 ? (
            <p className="text-sm text-ink-3">Sin ventas.</p>
          ) : (
            <ul className="grid gap-3">
              {methodRows.map((m) => (
                <li key={m.payment_method} className="grid gap-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <span>
                      {PAYMENT_LABEL[m.payment_method]} <span className="text-ink-3">· {m.sales_count}</span>
                    </span>
                    <span className="tabular font-medium">{formatCents(toCents(m.total))}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2" aria-hidden>
                    <div className="h-2 rounded-full bg-chart-bar" style={{ width: `${(toCents(m.total) / methodMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <h2 className="mb-4 font-semibold">Por vendedor</h2>
          {(sellers.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-3">Sin ventas.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {(sellers.data ?? []).map((v) => (
                <li key={v.seller_id ?? "none"} className="flex justify-between gap-3 py-2.5">
                  <span>
                    {(v.seller_id && names.get(v.seller_id)) || "Usuario eliminado"}{" "}
                    <span className="text-ink-3">· {v.sales_count}</span>
                  </span>
                  <span className="tabular font-medium">{formatCents(toCents(v.total))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-panel border border-line bg-surface p-4 sm:p-6">
        <h2 className="font-semibold">Productos más vendidos</h2>
        <p className="mb-4 text-sm text-ink-2">Por importe, antes de descuentos. La ganancia solo se calcula si el producto tenía costo al venderse.</p>
        {topRows.length === 0 ? (
          <p className="text-sm text-ink-3">Sin ventas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 text-right font-medium">Cantidad</th>
                  <th className="py-2 text-right font-medium">Importe</th>
                  <th className="py-2 text-right font-medium">Ganancia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topRows.map((t) => {
                  const rev = toCents(t.revenue);
                  const withCost = toCents(t.revenue_with_cost);
                  const gain = withCost - toCents(t.cost);
                  return (
                    <tr key={t.product_id}>
                      <td className="py-2.5 pr-3">
                        <Link href={`/dashboard/${slug}/products/${t.product_id}`} className="font-medium hover:underline">
                          {t.product_name}
                        </Link>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden>
                          <div className="h-1.5 rounded-full bg-chart-bar" style={{ width: `${(rev / topMax) * 100}%` }} />
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular">{formatQty(t.quantity, t.unit)}</td>
                      <td className="py-2.5 text-right tabular font-medium">{formatCents(rev)}</td>
                      <td className="py-2.5 text-right tabular">
                        {withCost > 0 ? formatCents(gain) : <span className="text-ink-3">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
