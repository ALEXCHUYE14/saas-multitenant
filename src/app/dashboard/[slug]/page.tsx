import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MetricStrip } from "@/components/ui/metric-strip";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import type { Customer, OrgPlan } from "@/lib/supabase/database.types";

const PLAN_LABEL: Record<OrgPlan, string> = { free: "Gratis", starter: "Inicial", pro: "Pro", enterprise: "Empresa" };
const dateFmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" });

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  // RLS limita todo a la organización activa: no hace falta filtrar por organization_id.
  const [total, thisMonth, prevMonth, members, recent] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", prevMonthStart)
      .lt("created_at", monthStart),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(6),
  ]);

  const newThis = thisMonth.count ?? 0;
  const newPrev = prevMonth.count ?? 0;
  const delta = newPrev > 0 ? Math.round(((newThis - newPrev) / newPrev) * 100) : undefined;
  const rows: Customer[] = recent.data ?? [];
  const firstName = ctx.fullName?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : "Resumen"}
        description={`Así va ${ctx.organization.name} este mes.`}
      />

      <MetricStrip
        metrics={[
          { label: "Clientes nuevos este mes", value: String(newThis), delta, note: "vs. mes anterior", primary: true },
          { label: "Clientes registrados", value: String(total.count ?? 0) },
          { label: "Personas en el equipo", value: String(members.count ?? 0) },
          { label: "Plan", value: PLAN_LABEL[ctx.organization.plan], note: ctx.organization.status === "trialing" ? "En prueba" : undefined },
        ]}
      />

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Últimos clientes</h2>
          <Link href={`/dashboard/${slug}/customers`} className="text-sm text-ink-2 hover:text-ink">
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
                <Link
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
