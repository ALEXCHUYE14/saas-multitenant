import type { Metadata } from "next";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { lineCents } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { ManageTables, TablesBoard, type LooseOrder, type TableCard } from "./tables-client";

export const metadata: Metadata = { title: "Mesas" };

const timeFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });

export default async function TablesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // Verificación del negocio y datos EN PARALELO (antes iban en fila): la página no
  // se muestra hasta que ambas terminen; si la verificación falla, redirige igual.
  const [ctx, tables, orders] = await Promise.all([
    getTenantContext(slug, { require: "orders:operate" }),
    supabase.from("dining_tables").select("*").order("sort_order").order("name"),
    supabase
      .from("orders")
      .select("id, table_id, label, opened_at, order_items(quantity, product:products(price))")
      .eq("status", "open")
      .order("opened_at"),
  ]);
  if (tables.error) throw new Error(tables.error.message);
  if (orders.error) throw new Error(orders.error.message);

  // Total estimado con los precios actuales (el cobro lo recalcula en el servidor).
  const summarize = (o: NonNullable<typeof orders.data>[number]) => ({
    cents: o.order_items.reduce((acc, it) => acc + lineCents(it.quantity, it.product?.price ?? 0), 0),
    items: o.order_items.length,
    since: timeFmt.format(new Date(o.opened_at)),
  });

  const byTable = new Map((orders.data ?? []).filter((o) => o.table_id).map((o) => [o.table_id!, o]));

  const cards: TableCard[] = (tables.data ?? [])
    .filter((t) => t.active || byTable.has(t.id))
    .map((t) => {
      const o = byTable.get(t.id);
      return { id: t.id, name: t.name, order: o ? { id: o.id, ...summarize(o) } : null };
    });

  const loose: LooseOrder[] = (orders.data ?? [])
    .filter((o) => !o.table_id)
    .map((o) => ({ id: o.id, label: o.label ?? "Sin nombre", ...summarize(o) }));

  return (
    <>
      <PageHeader title="Mesas" description="Toca una mesa libre para abrir su cuenta, o una ocupada para seguir atendiéndola." />
      <TablesBoard tables={cards} loose={loose} />
      {can(ctx.role, "tables:manage") && (
        <div className="mt-10">
          <ManageTables
            tables={(tables.data ?? []).map((t) => ({ id: t.id, name: t.name, active: t.active, busy: byTable.has(t.id) }))}
          />
        </div>
      )}
    </>
  );
}
