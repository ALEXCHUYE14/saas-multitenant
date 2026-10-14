import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_LABEL, formatMoney, formatQty } from "@/lib/format";
import { TicketToolbar } from "@/components/print/ticket-toolbar";

export const metadata: Metadata = { title: "Ticket" };

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Nota de venta para impresora térmica (58/80 mm). Ruta fuera del panel para
 * imprimir solo el ticket. Misma validación de tenant que el dashboard.
 */
export default async function PrintSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { slug, id } = await params;
  const { auto } = await searchParams;
  const ctx = await getTenantContext(slug, { require: "sales:read" });
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: sale, error }, items] = await Promise.all([
    supabase.from("sales").select("*, customer:customers(full_name, document_id)").eq("id", id).maybeSingle(),
    supabase.from("sale_items").select("*").eq("sale_id", id).order("product_name"),
  ]);
  if (error) throw new Error(error.message);
  if (!sale) notFound();
  if (items.error) throw new Error(items.error.message);

  const { data: seller } = sale.created_by
    ? await supabase.from("profiles").select("full_name").eq("id", sale.created_by).maybeSingle()
    : { data: null };

  const org = ctx.organization;
  const voided = sale.status === "voided";

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <TicketToolbar backHref={`/dashboard/${slug}/sales/${sale.id}`} autoPrint={auto === "1"} />

      <article className="ticket mx-auto bg-white p-[3mm] font-mono text-[11px] leading-snug text-black shadow print:shadow-none">
        <header className="text-center">
          <p className="text-[13px] font-bold uppercase">{org.name}</p>
          {org.tax_id && <p>RUC {org.tax_id}</p>}
          {org.address && <p>{org.address}</p>}
          {org.phone && <p>Tel. {org.phone}</p>}
        </header>

        <Rule />
        <p className="text-center font-bold">NOTA DE VENTA N.º {String(sale.number).padStart(6, "0")}</p>
        <p>Fecha: {dateFmt.format(new Date(sale.created_at))}</p>
        {seller?.full_name && <p>Atendió: {seller.full_name}</p>}
        {sale.customer && (
          <p>
            Cliente: {sale.customer.full_name}
            {sale.customer.document_id ? ` (${sale.customer.document_id})` : ""}
          </p>
        )}
        {voided && <p className="my-1 border border-black text-center font-bold">*** ANULADA ***</p>}
        <Rule />

        <ul>
          {(items.data ?? []).map((it) => (
            <li key={it.id} className="py-0.5">
              <p className="break-words">{it.product_name}</p>
              <p className="flex justify-between gap-2">
                <span>
                  {formatQty(it.quantity, it.unit)} x {formatMoney(it.unit_price)}
                </span>
                <span>{formatMoney(it.line_total)}</span>
              </p>
            </li>
          ))}
        </ul>

        <Rule />
        {sale.discount > 0 && (
          <>
            <Line label="Subtotal" value={formatMoney(sale.subtotal)} />
            <Line label="Descuento" value={`-${formatMoney(sale.discount)}`} />
          </>
        )}
        <Line label="TOTAL" value={formatMoney(sale.total)} bold />
        <Line label="Pago" value={PAYMENT_LABEL[sale.payment_method]} />
        {sale.amount_received != null && <Line label="Recibido" value={formatMoney(sale.amount_received)} />}
        {sale.change_given != null && sale.change_given > 0 && <Line label="Vuelto" value={formatMoney(sale.change_given)} />}
        <Rule />

        {org.ticket_footer && <p className="text-center">{org.ticket_footer}</p>}
        <p className="mt-1 text-center text-[9px]">No válido como comprobante de pago</p>
      </article>
    </div>
  );
}

function Rule() {
  return <hr className="my-1.5 border-0 border-t border-dashed border-black" />;
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <p className={`flex justify-between gap-2 ${bold ? "text-[13px] font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}
