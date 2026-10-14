"use client";

import { useActionState } from "react";
import { changePassword, updateProfileName, type PasswordState, type ProfileNameState } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";

export function ProfileNameForm({ initialName }: { initialName: string }) {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<ProfileNameState, FormData>(
    updateProfileName.bind(null, organization.slug),
    {},
  );

  return (
    <form action={action} className="rounded-panel border border-line bg-surface p-4 sm:p-6" noValidate>
      <h2 className="font-semibold">Tu nombre</h2>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field
          label="Nombre completo"
          name="full_name"
          defaultValue={initialName}
          autoComplete="name"
          required
          className="flex-1"
          error={state.error}
          hint={state.saved ? "Nombre guardado." : "Así te verá tu equipo."}
        />
        <Button type="submit" loading={pending} className="sm:mt-[1.625rem] sm:h-11">
          Guardar nombre
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword.bind(null, organization.slug), {});

  return (
    <form action={action} className="rounded-panel border border-line bg-surface p-4 sm:p-6" noValidate>
      <h2 className="font-semibold">Contraseña</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FormAlert error={state.error} notice={state.saved ? "Contraseña actualizada." : undefined} />
        <Field
          label="Contraseña actual"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          className="sm:col-span-2"
          error={state.fieldErrors?.current_password}
        />
        <Field
          label="Nueva contraseña"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="Al menos 8 caracteres, con letras y números."
          error={state.fieldErrors?.password}
        />
        <Field
          label="Repite la nueva contraseña"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          required
          error={state.fieldErrors?.password_confirm}
        />
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={pending}>
          Cambiar contraseña
        </Button>
      </div>
    </form>
  );
}
