"use client";

import { useActionState, useState } from "react";
import { adjustStock, type AdjustState } from "../actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { FormAlert } from "@/components/ui/form-alert";
import { formatQty, unitDecimals } from "@/lib/format";
import type { Product } from "@/lib/supabase/database.types";

const KIND_OPTIONS = [
  { value: "purchase", label: "Entrada (compra o reposición)" },
  { value: "waste", label: "Salida (merma, vencido, consumo)" },
  { value: "adjustment", label: "Ajuste por conteo" },
];

const QTY_LABEL: Record<string, string> = {
  purchase: "Cantidad que entra",
  waste: "Cantidad que sale",
  adjustment: "Stock contado",
};

export function AdjustStockForm({ product }: { product: Product }) {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<AdjustState, FormData>(
    adjustStock.bind(null, organization.slug, product.id),
    {},
  );
  const [kind, setKind] = useState("purchase");
  const decimals = unitDecimals(product.unit);

  return (
    <form action={action} className="rounded-panel border border-line bg-surface p-4 sm:p-6" noValidate>
      <h2 className="font-semibold">Registrar movimiento</h2>
      <p className="mt-1 text-sm text-ink-2">
        Stock actual: <span className="tabular font-medium text-ink">{formatQty(product.stock, product.unit)}</span>
      </p>
      <div className="mt-5 grid gap-4">
        <FormAlert error={state.error} notice={state.saved ? "Movimiento registrado." : undefined} />
        <SelectField
          label="Tipo"
          name="kind"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          error={state.fieldErrors?.kind}
        />
        <Field
          label={QTY_LABEL[kind] ?? "Cantidad"}
          name="quantity"
          inputMode={decimals === 0 ? "numeric" : "decimal"}
          required
          hint={
            kind === "adjustment"
              ? "Escribe cuánto hay realmente; se registra la diferencia."
              : decimals === 0
                ? "Cantidad entera."
                : "Hasta 3 decimales (ej. 2.5)."
          }
          error={state.fieldErrors?.quantity}
        />
        <Field label="Nota" name="note" maxLength={200} placeholder="Opcional. Ej.: Factura 001-123" error={state.fieldErrors?.note} />
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={pending}>
          Registrar
        </Button>
      </div>
    </form>
  );
}
