"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createCustomer, updateCustomer, type CustomerFormState } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import type { Customer } from "@/lib/supabase/database.types";

/** Sin `customer` registra uno nuevo; con `customer` edita ese registro. */
export function CustomerForm({ customer }: { customer?: Customer }) {
  const { organization, href } = useTenant();
  const [state, action, pending] = useActionState<CustomerFormState, FormData>(
    customer ? updateCustomer.bind(null, organization.slug, customer.id) : createCustomer.bind(null, organization.slug),
    {},
  );

  // Tras un error se muestran los valores enviados; si no, los guardados.
  const value = (k: keyof NonNullable<CustomerFormState["values"]>) => state.values?.[k] ?? customer?.[k] ?? "";

  return (
    <form
      key={JSON.stringify(state.values ?? null)}
      action={action}
      className="mb-8 rounded-panel border border-line bg-surface p-4 sm:p-6"
      noValidate
    >
      <h2 className="font-semibold">{customer ? "Editar cliente" : "Nuevo cliente"}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FormAlert error={state.error} />
        <Field label="Nombre completo" name="full_name" required autoFocus defaultValue={value("full_name")} error={state.fieldErrors?.full_name} className="sm:col-span-2" />
        <Field label="Teléfono" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={value("phone")} error={state.fieldErrors?.phone} />
        <Field label="DNI / RUC" name="document_id" inputMode="numeric" defaultValue={value("document_id")} error={state.fieldErrors?.document_id} />
        <Field label="Correo" name="email" type="email" inputMode="email" defaultValue={value("email")} error={state.fieldErrors?.email} className="sm:col-span-2" />
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link prefetch={false}
          href={href("/customers")}
          className="inline-flex h-10 items-center justify-center rounded-control px-4 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          Cancelar
        </Link>
        <Button type="submit" loading={pending}>
          {customer ? "Guardar cambios" : "Guardar cliente"}
        </Button>
      </div>
    </form>
  );
}
