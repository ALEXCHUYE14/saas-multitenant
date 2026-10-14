"use client";

import { useActionState } from "react";
import { updateTicketSettings, type TicketSettingsState } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";

export function TicketSettingsForm() {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<TicketSettingsState, FormData>(
    updateTicketSettings.bind(null, organization.slug),
    {},
  );

  return (
    <form action={action} className="rounded-panel border border-line bg-surface p-4 sm:p-6" noValidate>
      <h2 className="font-semibold">Datos del ticket</h2>
      <p className="mt-1 text-sm text-ink-2">Aparecen en la nota de venta impresa. Todos son opcionales.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FormAlert error={state.error} notice={state.saved ? "Datos del ticket guardados." : undefined} />
        <Field label="RUC" name="tax_id" inputMode="numeric" maxLength={11} defaultValue={organization.tax_id ?? ""} error={state.fieldErrors?.tax_id} />
        <Field label="Teléfono" name="phone" type="tel" maxLength={30} defaultValue={organization.phone ?? ""} error={state.fieldErrors?.phone} />
        <Field label="Dirección" name="address" maxLength={160} defaultValue={organization.address ?? ""} error={state.fieldErrors?.address} className="sm:col-span-2" />
        <Field
          label="Mensaje al pie"
          name="ticket_footer"
          maxLength={200}
          placeholder="¡Gracias por su compra!"
          defaultValue={organization.ticket_footer ?? ""}
          error={state.fieldErrors?.ticket_footer}
          className="sm:col-span-2"
        />
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={pending}>
          Guardar datos del ticket
        </Button>
      </div>
    </form>
  );
}
