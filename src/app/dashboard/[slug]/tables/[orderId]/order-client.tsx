"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Minus, Plus, Printer, Trash2 } from "lucide-react";
import { addOrderItem, cancelOrder, moveOrder, payOrder, setOrderItemQuantity } from "../actions";
import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/cn";
import { ProductGrid, type PosProduct } from "@/components/pos/product-grid";
import { CheckoutPanel, type CheckoutPayment, type ChargeResult } from "@/components/pos/checkout-panel";
import { FormAlert } from "@/components/ui/form-alert";
import { formatCents, formatMoney, lineCents, unitDecimals } from "@/lib/format";
import type { ProductUnit } from "@/lib/supabase/database.types";

export type OrderLine = {
  id: string;
  productId: string;
  name: string;
  unit: ProductUnit;
  price: number;
  quantity: number;
  note: string | null;
  available: boolean;
};

export function OrderClient({
  orderId,
  title,
  lines,
  products,
  freeTables,
  currentTableId,
  canDiscount,
  canCredit,
}: {
  orderId: string;
  title: string;
  lines: OrderLine[];
  products: PosProduct[];
  freeTables: { id: string; name: string }[];
  currentTableId: string | null;
  canDiscount: boolean;
  canCredit: boolean;
}) {
  const { organization, href } = useTenant();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => {
      setError(undefined);
      const res = await fn();
      if (res?.error) setError(res.error);
    });

  const pick = (p: PosProduct) => {
    const n = note;
    setNote("");
    run(() => addOrderItem(organization.slug, orderId, p.id, n));
  };

  // "+" suma en el servidor (atómico); "−" y la edición fijan el valor exacto.
  const increment = (l: OrderLine) => run(() => addOrderItem(organization.slug, orderId, l.productId, l.note ?? undefined));
  const setQty = (l: OrderLine, value: string) => run(() => setOrderItemQuantity(organization.slug, l.id, value));
  const decrement = (l: OrderLine) => setQty(l, l.quantity > 1 ? String(l.quantity - 1) : "0");

  const subtotal = lines.reduce((a, l) => a + lineCents(l.quantity, l.price), 0);
  const unavailable = lines.find((l) => !l.available);
  const itemsProblem =
    lines.length === 0
      ? "Agrega productos al pedido."
      : unavailable
        ? `«${unavailable.name}» ya no está disponible. Quítalo para cobrar.`
        : null;

  const charge = async (p: CheckoutPayment): Promise<ChargeResult> => {
    const res = await payOrder(organization.slug, orderId, {
      payment_method: p.method,
      amount_received: p.received,
      discount: p.discount,
      customer_id: p.customerId,
    });
    // Si sale bien, la página se recarga sola y muestra el pedido cobrado.
    return res.ok ? { ok: true } : res;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <div className="grid gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="shrink-0 text-ink-2">Nota para el próximo producto:</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
            placeholder="sin cebolla, bien cocido…"
            className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-base outline-none placeholder:text-ink-3 focus:border-accent sm:text-sm"
          />
        </label>
        <ProductGrid products={products} onPick={pick} />
      </div>

      <section aria-label="Pedido" className="rounded-panel border border-line bg-surface lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="truncate font-semibold">{title}</h2>
          <a
            href={`/print/${organization.slug}/orders/${orderId}?auto=1`}
            target="_blank"
            rel="noopener"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
          >
            <Printer className="size-4" />
            Precuenta
          </a>
        </div>

        {error && (
          <div className="border-b border-line p-3">
            <FormAlert error={error} />
          </div>
        )}

        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">Toca un producto para agregarlo al pedido.</p>
        ) : (
          <ul className={cn("max-h-[45vh] divide-y divide-line overflow-y-auto", pending && "opacity-70")}>
            {lines.map((l) => {
              const decimals = unitDecimals(l.unit);
              return (
                <li key={l.id} className="grid gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm">
                      <span className={cn("font-medium", !l.available && "text-danger line-through")}>{l.name}</span>
                      {l.note && <span className="block text-xs text-warn">{l.note}</span>}
                    </span>
                    <span className="tabular text-sm font-medium">{formatCents(lineCents(l.quantity, l.price))}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {decimals === 0 ? (
                      <>
                        <button type="button" onClick={() => decrement(l)} aria-label="Quitar uno" className="grid size-8 place-items-center rounded-control border border-line hover:bg-surface-2">
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-8 text-center tabular text-sm">{l.quantity}</span>
                        <button
                          type="button"
                          disabled={!l.available}
                          onClick={() => increment(l)}
                          aria-label="Agregar uno"
                          className="grid size-8 place-items-center rounded-control border border-line hover:bg-surface-2 disabled:opacity-40"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </>
                    ) : (
                      <QtyEditor key={l.quantity} line={l} onSave={(v) => setQty(l, v)} />
                    )}
                    <span className="text-xs text-ink-3">× {formatMoney(l.price)}</span>
                    <button
                      type="button"
                      onClick={() => setQty(l, "0")}
                      aria-label={`Quitar ${l.name}`}
                      className="ml-auto grid size-8 place-items-center rounded-control text-ink-3 hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <CheckoutPanel
          subtotalCents={subtotal}
          hasItems={lines.length > 0}
          itemsProblem={pending ? "Guardando cambios…" : itemsProblem}
          canDiscount={canDiscount}
          canCredit={canCredit}
          onCharge={charge}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm">
          <select
            aria-label="Cambiar de mesa"
            value=""
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              if (v) run(() => moveOrder(organization.slug, orderId, v === "__none" ? null : v));
            }}
            className="h-9 rounded-control border border-line bg-surface-2 px-2 text-ink-2"
          >
            <option value="">Cambiar de mesa…</option>
            {currentTableId && <option value="__none">Sin mesa (para llevar)</option>}
            {freeTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <Link href={href("/tables")} className="text-ink-2 hover:text-ink">
              Volver
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                let reason = "";
                if (lines.length > 0) {
                  const r = prompt("Motivo para cancelar el pedido (los productos no se cobrarán):");
                  if (r === null) return;
                  reason = r;
                } else if (!confirm("¿Cancelar este pedido vacío?")) return;
                run(() => cancelOrder(organization.slug, orderId, reason));
              }}
              className="text-danger hover:underline"
            >
              Cancelar pedido
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Cantidad decimal (kg/L): se guarda al salir del campo o con Enter. */
function QtyEditor({ line, onSave }: { line: OrderLine; onSave: (v: string) => void }) {
  const [value, setValue] = useState(String(line.quantity));
  const save = () => {
    if (value.trim() !== String(line.quantity)) onSave(value);
  };
  return (
    <span className="flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
        inputMode="decimal"
        aria-label={`Cantidad de ${line.name}`}
        className="h-8 w-20 rounded-control border border-line bg-surface-2 px-2 text-center text-base tabular outline-none focus:border-accent sm:text-sm"
      />
      <span className="text-xs text-ink-3">{line.unit === "kg" ? "kg" : "L"}</span>
    </span>
  );
}
