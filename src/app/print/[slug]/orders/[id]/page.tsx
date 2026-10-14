import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { formatCents, formatMoney, formatQty, lineCents } from "@/lib/format";
import { TicketToolbar } from "@/components/print/ticket-toolbar";

export const metadata: Metadata = { title: "Precuenta" };

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Precuenta de un pedido abierto: lo que se lleva a la mesa antes de cobrar. */
export default async function PrintOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { slug, id } = await params;
  const { auto } = await searchParams;
  const ctx = await getTenantContext(slug, { require: "orders:operate" });
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: order, error }, items] = await Promise.all([
    supabase.from("orders").select("*, table:dining_tables(name)").eq("id", id).maybeSingle(),
    supabase
      .from("order_items")
      .select("id, quantity, note, product:products(name, unit, price)")
      .eq("order_id", id)
      .order("created_at"),
  ]);
  if (error) throw new Error(error.message);
  if (!order) notFound();
  if (items.error) throw new Error(items.error.message);

  const org = ctx.organization;
  const rows = (items.data ?? []).map((it) => ({
    id: it.id,
    name: it.product?.name ?? "Producto",
    unit: it.product?.unit ?? "unit",
    price: it.product?.price ?? 0,
    quantity: it.quantity,
    note: it.note,
    cents: lineCents(it.quantity, it.product?.price ?? 0),
  }));
  const total = rows.reduce((a, r) => a + r.cents, 0);

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <TicketToolbar backHref={`/dashboard/${slug}/tables/${order.id}`} autoPrint={auto === "1"} />

      <article className="ticket mx-auto bg-white p-[3mm] font-mono text-[11px] leading-snug text-black shadow print:shadow-none">
        <header className="text-center">
          <p className="text-[13px] font-bold uppercase">{org.name}</p>
          <p className="mt-1 font-bold">PRECUENTA</p>
          <p>{order.table?.name ?? order.label ?? "Pedido"}</p>
          <p>{dateFmt.format(new Date())}</p>
        </header>
        <hr className="my-1.5 border-0 border-t border-dashed border-black" />
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="py-0.5">
              <p className="break-words">{r.name}</p>
              {r.note && <p className="pl-2 text-[10px]">* {r.note}</p>}
              <p className="flex justify-between gap-2">
                <span>
                  {formatQty(r.quantity, r.unit)} x {formatMoney(r.price)}
                </span>
                <span>{formatCents(r.cents)}</span>
              </p>
            </li>
          ))}
        </ul>
        <hr className="my-1.5 border-0 border-t border-dashed border-black" />
        <p className="flex justify-between text-[13px] font-bold">
          <span>TOTAL</span>
          <span>{formatCents(total)}</span>
        </p>
        <p className="mt-2 text-center text-[9px]">Precuenta. No es comprobante de pago.</p>
      </article>
    </div>
  );
}
