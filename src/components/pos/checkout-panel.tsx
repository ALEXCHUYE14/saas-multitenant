"use client";

import { useRef, useState, useTransition } from "react";
import type { CustomerOption } from "@/app/dashboard/[slug]/pos/actions";
import { CustomerPicker } from "./customer-picker";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { PAYMENT_LABEL, formatCents, parseDecimal, toCents } from "@/lib/format";
import type { PaymentMethod } from "@/lib/supabase/database.types";

const METHODS = Object.keys(PAYMENT_LABEL) as PaymentMethod[];

export type CheckoutPayment = {
  method: PaymentMethod;
  /** Texto tal cual; el servidor lo valida. Vacío = pago exacto. */
  received?: string;
  discount?: string;
  customerId: string | null;
};

export type ChargeResult = { ok: true } | { ok: false; error: string };

/**
 * Descuento, cliente, medio de pago, recibido/vuelto y botón Cobrar.
 * Una sola implementación de las validaciones del cobro para Vender y Mesas.
 * El total mostrado es una vista previa: el servidor recalcula con sus precios.
 */
export function CheckoutPanel({
  subtotalCents,
  hasItems,
  itemsProblem,
  canDiscount,
  canCredit,
  initialCustomer = null,
  onCharge,
}: {
  subtotalCents: number;
  hasItems: boolean;
  /** Problema del carrito/pedido que impide cobrar (o null). */
  itemsProblem: string | null;
  canDiscount: boolean;
  canCredit: boolean;
  initialCustomer?: CustomerOption | null;
  onCharge: (payment: CheckoutPayment) => Promise<ChargeResult>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [discount, setDiscount] = useState("");
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const submitting = useRef(false);

  const discountValue = discount.trim() ? parseDecimal(discount, 2) : 0;
  const discountCents = discountValue === null ? null : toCents(discountValue);
  const total = discountCents === null ? null : subtotalCents - discountCents;

  const receivedValue = received.trim() ? parseDecimal(received, 2) : null;
  const receivedCents = receivedValue === null ? null : toCents(receivedValue);
  const change = method === "cash" && receivedCents !== null && total !== null ? receivedCents - total : null;

  const problem =
    itemsProblem ??
    (discountCents === null
      ? "Descuento no válido."
      : total !== null && total < 0
        ? "El descuento es mayor que el subtotal."
        : method === "cash" && received.trim() && receivedCents === null
          ? "Monto recibido no válido."
          : change !== null && change < 0
            ? "El monto recibido es menor que el total."
            : method === "credit" && !customer
              ? "Elige al cliente para fiar."
              : null);

  const charge = () => {
    if (problem || submitting.current) return;
    submitting.current = true; // evita doble cobro por doble clic
    setError(undefined);
    start(async () => {
      try {
        const res = await onCharge({
          method,
          received: method === "cash" ? received : undefined,
          discount: canDiscount ? discount : undefined,
          customerId: customer?.id ?? null,
        });
        if (res.ok) {
          setReceived("");
          setDiscount("");
          setMethod("cash");
          setCustomer(null);
        } else {
          setError(res.error);
        }
      } catch {
        setError("Se perdió la conexión. Revisa en Ventas si el cobro se registró antes de intentarlo de nuevo.");
      } finally {
        submitting.current = false;
      }
    });
  };

  const moneyInput = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <span className="flex h-9 w-32 items-center rounded-control border border-line bg-surface-2 focus-within:border-accent">
      <span className="pl-2 text-ink-3">S/</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        className="h-full w-full bg-transparent px-2 text-right text-base tabular outline-none sm:text-sm"
      />
    </span>
  );

  return (
    <div className="grid gap-4 border-t border-line p-4">
      {canDiscount && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">Descuento</span>
          {moneyInput(discount, setDiscount, "0.00")}
        </label>
      )}

      <div className="flex items-baseline justify-between">
        <span className="text-ink-2">Total</span>
        <span className="tabular text-[2rem] leading-none font-semibold text-accent">
          {total === null || total < 0 ? "—" : formatCents(total)}
        </span>
      </div>

      <CustomerPicker value={customer} onChange={setCustomer} required={method === "credit"} />

      <div role="radiogroup" aria-label="Medio de pago" className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-3">
        {METHODS.filter((m) => m !== "credit" || canCredit).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={cn(
              "h-9 rounded-control border text-sm",
              method === m ? "border-accent bg-accent-soft font-medium" : "border-line text-ink-2 hover:text-ink",
            )}
          >
            {PAYMENT_LABEL[m]}
          </button>
        ))}
      </div>

      {method === "cash" && (
        <div className="grid gap-2">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-2">Recibido</span>
            {moneyInput(received, setReceived, "Exacto")}
          </label>
          {change !== null && change >= 0 && (
            <p className="flex justify-between text-sm">
              <span className="text-ink-2">Vuelto</span>
              <span className="tabular font-semibold">{formatCents(change)}</span>
            </p>
          )}
        </div>
      )}

      <FormAlert error={error} />
      {problem && hasItems && <p className="text-xs text-danger">{problem}</p>}

      <Button type="button" size="lg" onClick={charge} loading={pending} disabled={Boolean(problem)} className="w-full">
        Cobrar {total !== null && total >= 0 && hasItems ? formatCents(total) : ""}
      </Button>
    </div>
  );
}
