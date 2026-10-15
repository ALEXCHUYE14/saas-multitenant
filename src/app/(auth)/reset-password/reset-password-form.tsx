"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { FormAlert } from "@/components/ui/form-alert";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});

  return (
    <form action={action} className="mt-7 grid gap-5" noValidate>
      <FormAlert error={state.error} />
      <PasswordField
        label="Nueva contraseña"
        name="password"
        autoComplete="new-password"
        required
        autoFocus
        hint="Al menos 8 caracteres, con letras y números."
        error={state.fieldErrors?.password}
      />
      <PasswordField
        label="Repite la contraseña"
        name="password_confirm"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password_confirm}
      />
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Guardar contraseña
      </Button>
    </form>
  );
}
