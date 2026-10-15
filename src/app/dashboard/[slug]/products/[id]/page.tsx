import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";
import { UNIT_LABEL, formatMoney, formatQty } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { MetricStrip, type Metric } from "@/components/ui/metric-strip";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AdjustStockForm } from "./adjust-form";
import type { StockMovementKind } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Producto" };

const KIND_LABEL: Record<StockMovementKind, string> = {
  initial: "Stock inicial",
  purchase: "Entrada",
  waste: "Salida",
  adjustment: "Ajuste",
  sale: "Venta",
  sale_void: "Venta anulada",
};

const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function ProductPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug, { require: "products:read" });
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: product, error }, movements, team] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("stock_movements").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (error) throw new Error(error.message);
  if (!product) notFound();

  const names = new Map((team.data ?? []).map((p) => [p.id, p.full_name]));
  const canAdjust = can(ctx.role, "inventory:adjust") && product.track_stock;
  const showCost = can(ctx.role, "products:write") && product.cost != null;
  const margin =
    product.cost != null && product.price > 0 ? Math.round(((product.price - product.cost) / product.price) * 100) : null;
  const signed = (q: number) => `${q > 0 ? "+" : "−"}${formatQty(Math.abs(q), product.unit)}`;

  const metrics: Metric[] = [{ label: "Precio", value: formatMoney(product.price), primary: true }];
  if (product.track_stock)
    metrics.push({
      label: "Stock",
      value: formatQty(product.stock, product.unit),
      note: product.low_stock
        ? "Por debajo del mínimo"
        : product.min_stock != null
          ? `Mínimo ${formatQty(product.min_stock, product.unit)}`
          : undefined,
    });
  if (showCost)
    metrics.push({ label: "Costo", value: formatMoney(product.cost), note: margin != null ? `Margen ${margin}%` : undefined });

  return (
    <>
      <Link prefetch={false} href={`/dashboard/${slug}/products`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" />
        Productos
      </Link>

      <PageHeader
        title={product.name}
        description={[product.category, product.code, UNIT_LABEL[product.unit]].filter(Boolean).join(" · ")}
        actions={!product.active && <Badge>Archivado</Badge>}
      />

      <MetricStrip metrics={metrics} />

      {!product.track_stock ? (
        <p className="mt-8 text-sm text-ink-2">Este producto no controla stock.</p>
      ) : (
        <div className={cn("mt-8 grid gap-6", canAdjust && "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start")}>
          {canAdjust && <AdjustStockForm product={product} />}

          <section className="min-w-0">
            <h2 className="mb-3 font-semibold">Historial de stock</h2>
            <DataTable
              caption="Movimientos de stock"
              rows={movements.data ?? []}
              rowKey={(m) => m.id}
              columns={[
                { key: "date", header: "Fecha", cell: (m) => dateFmt.format(new Date(m.created_at)) },
                { key: "kind", header: "Movimiento", cell: (m) => KIND_LABEL[m.kind] },
                {
                  key: "qty",
                  header: "Cantidad",
                  align: "right",
                  cell: (m) => <span className={m.quantity > 0 ? "text-ok" : "text-danger"}>{signed(m.quantity)}</span>,
                },
                { key: "after", header: "Queda", align: "right", cell: (m) => formatQty(m.stock_after, product.unit) },
                {
                  key: "detail",
                  header: "Detalle",
                  hideOnMobile: true,
                  cell: (m) => (
                    <span className="text-ink-2">
                      {[m.created_by ? names.get(m.created_by) : null, m.note].filter(Boolean).join(" · ") || "—"}
                    </span>
                  ),
                },
              ]}
              mobileRow={(m) => ({
                title: `${KIND_LABEL[m.kind]} ${signed(m.quantity)}`,
                meta: [dateFmt.format(new Date(m.created_at)), m.note].filter(Boolean).join(" · "),
                aside: <span className="tabular text-sm">{formatQty(m.stock_after, product.unit)}</span>,
              })}
              empty={<EmptyState title="Sin movimientos" description="Aquí verás cada entrada, salida y ajuste de stock." />}
            />
          </section>
        </div>
      )}
    </>
  );
}
