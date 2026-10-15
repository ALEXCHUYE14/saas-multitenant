import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { OrderClient } from "./order-client";
import { loadOrderLines } from "../order-lines";

export const metadata: Metadata = { title: "Pedido" };

export default async function OrderPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;
  const ctx = await getTenantContext(slug, { require: "orders:operate" });
  if (!z.uuid().safeParse(orderId).success) notFound();

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, table:dining_tables(name)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) notFound();

  const title = order.table?.name ?? order.label ?? "Pedido";
  const back = (
    <Link prefetch={false} href={`/dashboard/${slug}/tables`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
      <ArrowLeft className="size-4" />
      Mesas
    </Link>
  );

  if (order.status !== "open") {
    const { data: sale } = order.sale_id
      ? await supabase.from("sales").select("id, number, total, change_given").eq("id", order.sale_id).maybeSingle()
      : { data: null };
    return (
      <>
        {back}
        <PageHeader title={title} />
        {order.status === "paid" && sale ? (
          <div className="max-w-md rounded-panel border border-line bg-surface p-6">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-5 text-ok" />
              Cobrado · Venta #{sale.number}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular">{formatMoney(sale.total)}</p>
            {sale.change_given != null && sale.change_given > 0 && <p className="mt-1">Vuelto: {formatMoney(sale.change_given)}</p>}
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <a
                href={`/print/${slug}/sales/${sale.id}?auto=1`}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center rounded-control bg-accent px-4 font-medium text-accent-ink"
              >
                Imprimir ticket
              </a>
              <Link prefetch={false} href={`/dashboard/${slug}/tables`} className="inline-flex h-10 items-center rounded-control border border-line px-4">
                Volver a mesas
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-2">
            Este pedido fue cancelado{order.cancel_reason ? `: ${order.cancel_reason}` : "."}
          </p>
        )}
      </>
    );
  }

  const [lines, products, tables, openOrders] = await Promise.all([
    loadOrderLines(supabase, orderId),
    supabase
      .from("products")
      .select("id, name, code, category, unit, price, track_stock, stock, low_stock")
      .eq("active", true)
      .order("name")
      .limit(2000),
    supabase.from("dining_tables").select("id, name").eq("active", true).order("sort_order").order("name"),
    supabase.from("orders").select("table_id").eq("status", "open").not("table_id", "is", null),
  ]);
  if (products.error) throw new Error(products.error.message);

  const busy = new Set((openOrders.data ?? []).map((o) => o.table_id));
  const freeTables = (tables.data ?? []).filter((t) => !busy.has(t.id));

  return (
    <>
      {back}
      <PageHeader title={title} />
      <OrderClient
        orderId={order.id}
        title={title}
        lines={lines}
        products={products.data ?? []}
        freeTables={freeTables}
        currentTableId={order.table_id}
        canDiscount={can(ctx.role, "sales:discount")}
        canCredit={can(ctx.role, "credit:sell")}
      />
    </>
  );
}
