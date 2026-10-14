"use client";

import { useActionState } from "react";
import { login, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});

  return (
    <form action={action} className="mt-8 grid gap-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormAlert error={state.error} />
      <Field
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Iniciar sesión
      </Button>
    </form>
  );
}
