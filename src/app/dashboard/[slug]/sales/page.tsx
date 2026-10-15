import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_LABEL, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import type { Sale } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Ventas" };

const PAGE_SIZE = 30;
const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type SP = Promise<{ page?: string; session?: string }>;

export default async function SalesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  const sp = await searchParams;
  await getTenantContext(slug, { require: "sales:read" });

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const sessionId = sp.session && z.uuid().safeParse(sp.session).success ? sp.session : null;

  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sessionId) query = query.eq("cash_session_id", sessionId);

  const [{ data, count, error }, team] = await Promise.all([query, supabase.from("profiles").select("id, full_name")]);
  if (error) throw new Error(error.message);
  const names = new Map((team.data ?? []).map((p) => [p.id, p.full_name]));

  const base = `/dashboard/${slug}/sales`;
  const hrefFor = (p: number) => `${base}?${new URLSearchParams({ ...(sessionId && { session: sessionId }), page: String(p) })}`;

  const numberCell = (s: Sale) => (
    <Link prefetch={false} href={`${base}/${s.id}`} className="font-medium tabular hover:underline">
      #{s.number}
    </Link>
  );
  const totalCell = (s: Sale) => (
    <span className={s.status === "voided" ? "text-ink-3 line-through" : undefined}>{formatMoney(s.total)}</span>
  );

  return (
    <>
      <PageHeader
        title="Ventas"
        description={sessionId ? "Ventas del turno de caja seleccionado." : "Todas las ventas registradas."}
        actions={
          sessionId && (
            <Link prefetch={false} href={base} className="inline-flex h-10 items-center rounded-control border border-line px-4 text-sm text-ink-2 hover:text-ink">
              Ver todas
            </Link>
          )
        }
      />

      <DataTable
        caption="Ventas"
        rows={data ?? []}
        rowKey={(s) => s.id}
        columns={[
          { key: "number", header: "N.º", cell: numberCell },
          { key: "date", header: "Fecha", cell: (s) => dateFmt.format(new Date(s.created_at)) },
          { key: "method", header: "Pago", cell: (s) => PAYMENT_LABEL[s.payment_method] },
          { key: "who", header: "Vendió", hideOnMobile: true, cell: (s) => (s.created_by ? names.get(s.created_by) : null) ?? "—" },
          { key: "status", header: "", cell: (s) => (s.status === "voided" ? <Badge tone="danger">Anulada</Badge> : null) },
          { key: "total", header: "Total", align: "right", cell: totalCell },
        ]}
        mobileRow={(s) => ({
          title: (
            <>
              {numberCell(s)} · {PAYMENT_LABEL[s.payment_method]}
              {s.status === "voided" && <span className="text-danger"> · Anulada</span>}
            </>
          ),
          meta: dateFmt.format(new Date(s.created_at)),
          aside: <span className="tabular text-sm font-medium">{totalCell(s)}</span>,
        })}
        empty={
          <EmptyState
            title="Aún no hay ventas"
            description="Las ventas que registres desde «Vender» aparecerán aquí."
            action={
              <Link prefetch={false}
                href={`/dashboard/${slug}/pos`}
                className="inline-flex h-10 items-center rounded-control bg-accent px-4 text-sm font-medium text-accent-ink"
              >
                Ir a vender
              </Link>
            }
          />
        }
      />

      {(count ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={hrefFor} />}
    </>
  );
}
