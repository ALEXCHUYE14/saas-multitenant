"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Minus, Plus, Trash2, X } from "lucide-react";
import { createSale, type SaleResult } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/cn";
import { ProductGrid, type PosProduct } from "@/components/pos/product-grid";
import { MobileTotalBar } from "@/components/pos/mobile-total-bar";
import { CheckoutPanel, type CheckoutPayment, type ChargeResult } from "@/components/pos/checkout-panel";
import { formatCents, formatMoney, lineCents, parseDecimal, unitDecimals } from "@/lib/format";

type CartLine = { product: PosProduct; qty: string };

/** Suma redondeando a los decimales de la unidad (evita 1.2000000000000002). */
function addQty(current: number, delta: number, unit: PosProduct["unit"]): string {
  return String(Number((current + delta).toFixed(unitDecimals(unit))));
}

export function PosClient({
  products,
  canDiscount,
  canCredit,
}: {
  products: PosProduct[];
  canDiscount: boolean;
  canCredit: boolean;
}) {
  const { href, organization } = useTenant();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [done, setDone] = useState<Extract<SaleResult, { ok: true }>["sale"] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Stock vendido en esta pantalla desde la última carga del servidor. Evita volver a
  // descargar todo el catálogo tras cada venta (la BD ya descontó el stock real).
  const [sold, setSold] = useState<Map<string, number>>(() => new Map());
  // Si llegan productos frescos del servidor, ya incluyen esas ventas: se reinicia.
  useEffect(() => setSold(new Map()), [products]);
  const shownProducts = useMemo(
    () =>
      sold.size === 0
        ? products
        : products.map((p) => {
            const q = sold.get(p.id);
            return q && p.track_stock ? { ...p, stock: Number((p.stock - q).toFixed(3)) } : p;
          }),
    [products, sold],
  );

  // --- Carrito ---------------------------------------------------------------
  const add = (product: PosProduct) => {
    setDone(null);
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === product.id);
      if (i === -1) return [...c, { product, qty: "1" }];
      const current = parseDecimal(c[i]!.qty, unitDecimals(product.unit)) ?? 0;
      return c.map((l, j) => (j === i ? { ...l, qty: addQty(current, 1, product.unit) } : l));
    });
  };

  const setQty = (id: string, qty: string) => setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty } : l)));
  const remove = (id: string) => setCart((c) => c.filter((l) => l.product.id !== id));
  const step = (line: CartLine, delta: number) => {
    const current = parseDecimal(line.qty, unitDecimals(line.product.unit)) ?? 0;
    const next = addQty(current, delta, line.product.unit);
    if (Number(next) <= 0) remove(line.product.id);
    else setQty(line.product.id, next);
  };

  const lines = cart.map((l) => {
    const qty = parseDecimal(l.qty, unitDecimals(l.product.unit));
    const valid = qty !== null && qty > 0;
    return { ...l, qtyValue: valid ? qty : null, cents: valid ? lineCents(qty, l.product.price) : 0 };
  });
  const subtotal = lines.reduce((a, l) => a + l.cents, 0);
  const itemsProblem =
    cart.length === 0
      ? "Agrega productos."
      : lines.some((l) => l.qtyValue === null)
        ? "Revisa las cantidades (los productos por unidad solo admiten enteros)."
        : null;

  // --- Cobro -----------------------------------------------------------------
  const charge = async (p: CheckoutPayment): Promise<ChargeResult> => {
    const res = await createSale(organization.slug, {
      items: lines.map((l) => ({ product_id: l.product.id, quantity: l.qtyValue! })),
      payment_method: p.method,
      amount_received: p.received,
      discount: p.discount,
      customer_id: p.customerId,
    });
    if (!res.ok) return res;
    setSold((prev) => {
      const next = new Map(prev);
      for (const l of lines) next.set(l.product.id, (next.get(l.product.id) ?? 0) + l.qtyValue!);
      return next;
    });
    setDone(res.sale);
    setCart([]);
    searchRef.current?.focus();
    return { ok: true };
  };

  return (
    <div className="grid gap-6 pb-24 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-start md:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <ProductGrid ref={searchRef} products={shownProducts} onPick={add} autoFocus />

      {/* Ticket */}
      <section id="ticket" aria-label="Venta actual" className="scroll-mt-20 rounded-panel border border-line bg-surface md:sticky md:top-20 md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">Venta actual</h2>
          {cart.length > 0 && (
            <button type="button" onClick={() => setCart([])} className="text-sm text-ink-3 hover:text-danger">
              Vaciar
            </button>
          )}
        </div>

        {done && (
          <div role="status" className="flex items-start gap-3 border-b border-line bg-ok/10 px-4 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
            <div className="flex-1">
              <p className="font-medium">
                Venta #{done.number} registrada · {formatMoney(done.total)}
              </p>
              {done.change != null && done.change > 0 && <p>Vuelto: {formatMoney(done.change)}</p>}
              <p className="mt-1 flex gap-4">
                <a
                  href={`/print/${organization.slug}/sales/${done.id}?auto=1`}
                  target="_blank"
                  rel="noopener"
                  className="font-medium underline underline-offset-4"
                >
                  Imprimir ticket
                </a>
                <Link prefetch={false} href={href(`/sales/${done.id}`)} className="text-ink-2 underline underline-offset-4">
                  Ver detalle
                </Link>
              </p>
            </div>
            <button type="button" onClick={() => setDone(null)} aria-label="Cerrar aviso" className="text-ink-3 hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        )}

        {cart.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">Toca un producto para agregarlo.</p>
        ) : (
          <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto">
            {lines.map((l) => {
              const decimals = unitDecimals(l.product.unit);
              return (
                <li key={l.product.id} className="grid gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{l.product.name}</span>
                    <span className="tabular text-sm font-medium">{l.qtyValue === null ? "—" : formatCents(l.cents)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {decimals === 0 && (
                      <button type="button" onClick={() => step(l, -1)} aria-label="Quitar uno" className="grid size-10 place-items-center sm:size-8 rounded-control border border-line hover:bg-surface-2">
                        <Minus className="size-3.5" />
                      </button>
                    )}
                    <input
                      value={l.qty}
                      onChange={(e) => setQty(l.product.id, e.target.value)}
                      inputMode={decimals === 0 ? "numeric" : "decimal"}
                      aria-label={`Cantidad de ${l.product.name}`}
                      aria-invalid={l.qtyValue === null || undefined}
                      className={cn(
                        "h-10 w-20 rounded-control sm:h-8 border bg-surface-2 px-2 text-center text-base tabular outline-none focus:border-accent sm:text-sm",
                        l.qtyValue === null ? "border-danger" : "border-line",
                      )}
                    />
                    {decimals === 0 && (
                      <button type="button" onClick={() => step(l, 1)} aria-label="Agregar uno" className="grid size-10 place-items-center sm:size-8 rounded-control border border-line hover:bg-surface-2">
                        <Plus className="size-3.5" />
                      </button>
                    )}
                    <span className="text-xs text-ink-3">
                      {decimals > 0 ? (l.product.unit === "kg" ? "kg" : "L") : ""} × {formatMoney(l.product.price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(l.product.id)}
                      aria-label={`Quitar ${l.product.name}`}
                      className="ml-auto grid size-10 place-items-center sm:size-8 rounded-control text-ink-3 hover:bg-danger/10 hover:text-danger"
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
          hasItems={cart.length > 0}
          itemsProblem={itemsProblem}
          canDiscount={canDiscount}
          canCredit={canCredit}
          onCharge={charge}
        />
      </section>

      <MobileTotalBar count={cart.length} totalCents={subtotal} targetId="ticket" />
    </div>
  );
}
