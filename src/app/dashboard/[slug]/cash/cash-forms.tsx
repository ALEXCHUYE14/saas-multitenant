"use client";

import { useActionState, useState } from "react";
import { closeCashSession, openCashSession, type CashFormState } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { formatCents, parseDecimal, toCents } from "@/lib/format";

export function OpenCashForm() {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<CashFormState, FormData>(openCashSession.bind(null, organization.slug), {});

  return (
    <form
      key={JSON.stringify(state.values ?? null)}
      action={action}
      className="max-w-md rounded-panel border border-line bg-surface p-4 sm:p-6"
      noValidate
    >
      <h2 className="font-semibold">Abrir caja</h2>
      <p className="mt-1 text-sm text-ink-2">Para vender necesitas una caja abierta. Indica con cuánto sencillo empiezas.</p>
      <div className="mt-5 grid gap-4">
        <FormAlert error={state.error} />
        <Field
          label="Efectivo inicial"
          name="amount"
          prefix="S/"
          inputMode="decimal"
          placeholder="0.00"
          autoFocus
          defaultValue={state.values?.amount}
          error={state.fieldErrors?.amount}
        />
      </div>
      <Button type="submit" loading={pending} className="mt-6 w-full">
        Abrir caja
      </Button>
    </form>
  );
}

export function CloseCashForm({ sessionId, expectedCents }: { sessionId: string; expectedCents: number }) {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<CashFormState, FormData>(
    closeCashSession.bind(null, organization.slug, sessionId),
    {},
  );
  const [counted, setCounted] = useState(state.values?.amount ?? "");
  const countedValue = parseDecimal(counted, 2);
  const diff = countedValue === null ? null : toCents(countedValue) - expectedCents;

  return (
    <form
      action={(fd) => {
        if (confirm("¿Cerrar la caja? Después no podrás registrar ventas ni anular las de este turno.")) action(fd);
      }}
      className="rounded-panel border border-line bg-surface p-4 sm:p-6"
      noValidate
    >
      <h2 className="font-semibold">Cerrar caja</h2>
      <p className="mt-1 text-sm text-ink-2">Cuenta el efectivo del cajón y escríbelo aquí.</p>
      <div className="mt-5 grid gap-4">
        <FormAlert error={state.error} />
        <Field
          label="Efectivo contado"
          name="amount"
          prefix="S/"
          inputMode="decimal"
          placeholder="0.00"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          error={state.fieldErrors?.amount}
          hint={
            diff === null ? undefined : diff === 0 ? (
              "Cuadra exacto."
            ) : diff > 0 ? (
              <span className="text-ok">Sobran {formatCents(diff)}</span>
            ) : (
              <span className="text-danger">Faltan {formatCents(-diff)}</span>
            )
          }
        />
        <Field label="Nota" name="note" maxLength={300} placeholder="Opcional" defaultValue={state.values?.note} error={state.fieldErrors?.note} />
      </div>
      <Button type="submit" loading={pending} className="mt-6 w-full">
        Cerrar caja
      </Button>
    </form>
  );
}
