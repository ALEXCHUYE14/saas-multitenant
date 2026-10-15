import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";
import { PAYMENT_LABEL, formatMoney, formatQty } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { VoidSaleForm } from "./void-form";

export const metadata: Metadata = { title: "Venta" };

const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" });

export default async function SalePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug, { require: "sales:read" });
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: sale, error }, items, team] = await Promise.all([
    supabase.from("sales").select("*, session:cash_sessions(closed_at), customer:customers(full_name)").eq("id", id).maybeSingle(),
    supabase.from("sale_items").select("*").eq("sale_id", id).order("product_name"),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (error) throw new Error(error.message);
  if (!sale) notFound();
  const names = new Map((team.data ?? []).map((p) => [p.id, p.full_name]));

  const voided = sale.status === "voided";
  const sessionOpen = sale.session?.closed_at === null;
  const canVoid = !voided && sessionOpen && can(ctx.role, "sales:void");

  const row = (label: string, value: React.ReactNode, strong?: boolean) => (
    <div className={cn("flex justify-between gap-4 text-sm", strong && "text-base font-semibold")}>
      <span className={strong ? undefined : "text-ink-2"}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );

  return (
    <>
      <Link prefetch={false} href={`/dashboard/${slug}/sales`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" />
        Ventas
      </Link>

      <PageHeader
        title={`Venta #${sale.number}`}
        description={`${dateFmt.format(new Date(sale.created_at))}${sale.created_by && names.get(sale.created_by) ? ` · ${names.get(sale.created_by)}` : ""}`}
        actions={
          <>
            {voided && <Badge tone="danger">Anulada</Badge>}
            <Link prefetch={false}
              href={`/print/${slug}/sales/${sale.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-control border border-line px-4 text-sm text-ink-2 hover:text-ink"
            >
              <Printer className="size-4" />
              Imprimir ticket
            </Link>
          </>
        }
      />

      <div className={cn("grid gap-6", canVoid && "lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start")}>
        <section className={cn("rounded-panel border border-line bg-surface p-4 sm:p-6", voided && "opacity-70")}>
          <ul className="divide-y divide-dashed divide-line">
            {(items.data ?? []).map((it) => (
              <li key={it.id} className="flex justify-between gap-4 py-2.5 text-sm">
                <span>
                  {it.product_name}
                  <span className="block text-xs text-ink-3">
                    {formatQty(it.quantity, it.unit)} × {formatMoney(it.unit_price)}
                  </span>
                </span>
                <span className="tabular">{formatMoney(it.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-1.5 border-t border-line pt-3">
            {sale.discount > 0 && row("Subtotal", formatMoney(sale.subtotal))}
            {sale.discount > 0 && row("Descuento", `−${formatMoney(sale.discount)}`)}
            {row("Total", formatMoney(sale.total), true)}
            {row("Pago", PAYMENT_LABEL[sale.payment_method])}
            {sale.amount_received != null && row("Recibido", formatMoney(sale.amount_received))}
            {sale.change_given != null && sale.change_given > 0 && row("Vuelto", formatMoney(sale.change_given))}
            {sale.customer?.full_name && row("Cliente", sale.customer.full_name)}
          </div>
          {voided && (
            <p className="mt-4 rounded-control bg-danger/10 px-3 py-2.5 text-sm text-danger">
              Anulada {sale.voided_at ? dateFmt.format(new Date(sale.voided_at)) : ""}
              {sale.voided_by && names.get(sale.voided_by) ? ` por ${names.get(sale.voided_by)}` : ""}. Motivo: {sale.void_reason}
            </p>
          )}
        </section>

        {canVoid && <VoidSaleForm saleId={sale.id} number={sale.number} />}
      </div>
    </>
  );
}
