"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});

  if (state.notice) return <div className="mt-8"><FormAlert notice={state.notice} /></div>;

  return (
    <form action={action} className="mt-8 grid gap-5" noValidate>
      <FormAlert error={state.error} />
      <Field
        label="Correo de tu cuenta"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        autoFocus
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Enviar enlace
      </Button>
    </form>
  );
}
