"use client";

import { useActionState } from "react";
import { voidSale, type VoidState } from "../actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";

export function VoidSaleForm({ saleId, number }: { saleId: string; number: number }) {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<VoidState, FormData>(voidSale.bind(null, organization.slug, saleId), {});

  return (
    <form
      key={state.reason ?? ""}
      action={(fd) => {
        if (confirm(`¿Anular la venta #${number}? Se devolverá el stock y dejará de contar en la caja.`)) action(fd);
      }}
      className="rounded-panel border border-line bg-surface p-4 sm:p-6"
      noValidate
    >
      <h2 className="font-semibold">Anular venta</h2>
      <p className="mt-1 text-sm text-ink-2">Solo mientras la caja de esta venta siga abierta.</p>
      <div className="mt-5 grid gap-4">
        <FormAlert error={state.error} />
        <Field label="Motivo" name="reason" required maxLength={200} placeholder="Ej.: Cobro duplicado" defaultValue={state.reason} />
      </div>
      <Button type="submit" variant="danger" loading={pending} className="mt-6 w-full">
        Anular venta
      </Button>
    </form>
  );
}
