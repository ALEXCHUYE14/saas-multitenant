import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MetricStrip } from "@/components/ui/metric-strip";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { limaStartOfDay, limaStartOfMonth } from "@/lib/dates";
import { formatCents, toCents } from "@/lib/format";
import type { Customer } from "@/lib/supabase/database.types";
const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // Fechas en hora de Lima (el servidor puede estar en UTC).
  const monthStart = limaStartOfMonth().toISOString();
  const prevMonthStart = limaStartOfMonth(-1).toISOString();
  const today = limaStartOfDay().toISOString();
  const tomorrow = limaStartOfDay(1).toISOString();
  const yesterday = limaStartOfDay(-1).toISOString();

  // RLS limita todo a la organización activa: no hace falta filtrar por organization_id.
  // Verificación del negocio y datos EN PARALELO (antes iban en fila): la página no
  // se muestra hasta que ambas terminen; si la verificación falla, redirige igual.
  const [ctx, salesToday, salesYesterday, lowStock, thisMonth, prevMonth, recent] = await Promise.all([
    getTenantContext(slug),
    supabase.rpc("sales_summary", { p_from: today, p_to: tomorrow }),
    supabase.rpc("sales_summary", { p_from: yesterday, p_to: today }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true).eq("low_stock", true),
    supabase.from("customers").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", prevMonthStart)
      .lt("created_at", monthStart),
    supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(6),
  ]);

  const newThis = thisMonth.count ?? 0;
  const newPrev = prevMonth.count ?? 0;
  const delta = newPrev > 0 ? Math.round(((newThis - newPrev) / newPrev) * 100) : undefined;
  // Si las tablas de ventas aún no existen (migración pendiente), se muestra 0 en vez de romper el panel.
  const todayCents = toCents(salesToday.data?.[0]?.total ?? 0);
  const yesterdayCents = toCents(salesYesterday.data?.[0]?.total ?? 0);
  const salesDelta = yesterdayCents > 0 ? Math.round(((todayCents - yesterdayCents) / yesterdayCents) * 100) : undefined;
  const rows: Customer[] = recent.data ?? [];
  const firstName = ctx.fullName?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : "Resumen"}
        description={`Así va ${ctx.organization.name} hoy.`}
      />

      <MetricStrip
        metrics={[
          { label: "Vendido hoy", value: formatCents(todayCents), delta: salesDelta, note: "vs. ayer", primary: true },
          { label: "Ventas de hoy", value: String(salesToday.data?.[0]?.sales_count ?? 0) },
          { label: "Productos por reponer", value: String(lowStock.count ?? 0) },
          { label: "Clientes nuevos este mes", value: String(newThis), delta, note: "vs. mes anterior" },
        ]}
      />

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Últimos clientes</h2>
          <Link prefetch={false} href={`/dashboard/${slug}/customers`} className="text-sm text-ink-2 hover:text-ink">
            Ver todos
          </Link>
        </div>
        <DataTable
          caption="Últimos clientes registrados"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: "name", header: "Nombre", cell: (r) => <span className="font-medium">{r.full_name}</span> },
            { key: "phone", header: "Teléfono", cell: (r) => r.phone ?? <span className="text-ink-3">—</span> },
            { key: "doc", header: "DNI / RUC", cell: (r) => r.document_id ?? <span className="text-ink-3">—</span>, hideOnMobile: true },
            { key: "date", header: "Registro", align: "right", cell: (r) => dateFmt.format(new Date(r.created_at)) },
          ]}
          mobileRow={(r) => ({
            title: r.full_name,
            meta: r.phone ?? r.email ?? undefined,
            aside: <Badge>{dateFmt.format(new Date(r.created_at))}</Badge>,
          })}
          empty={
            <EmptyState
              title="Aún no hay clientes"
              description="Registra al primero para empezar a ver tu actividad aquí."
              action={
                <Link prefetch={false}
                  href={`/dashboard/${slug}/customers?new=1`}
                  className="inline-flex h-10 items-center rounded-control bg-accent px-4 text-sm font-medium text-accent-ink"
                >
                  Registrar cliente
                </Link>
              }
            />
          }
        />
      </section>
    </>
  );
}
