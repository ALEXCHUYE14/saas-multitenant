"use client";

import { useActionState } from "react";
import { updateOrgName, type OrgNameState } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function OrgNameForm({ initialName }: { initialName: string }) {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<OrgNameState, FormData>(updateOrgName.bind(null, organization.slug), {});

  return (
    <form action={action} className="rounded-panel border border-line bg-surface p-4 sm:p-6" noValidate>
      <h2 className="font-semibold">Nombre del negocio</h2>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field
          label="Nombre"
          name="name"
          defaultValue={initialName}
          required
          className="flex-1"
          error={state.error}
          hint={state.saved ? "Nombre guardado." : "Lo verá todo tu equipo."}
        />
        <Button type="submit" loading={pending} className="sm:mt-[1.625rem] sm:h-11">
          Guardar nombre
        </Button>
      </div>
    </form>
  );
}
