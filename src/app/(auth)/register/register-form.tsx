"use client";

import { useActionState } from "react";
import { register, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { FormAlert } from "@/components/ui/form-alert";

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(register, {});

  if (state.notice) {
    return (
      <div className="mt-8">
        <FormAlert notice={state.notice} />
      </div>
    );
  }

  return (
    <form action={action} className="mt-7 grid gap-5" noValidate>
      <FormAlert error={state.error} />
      <Field
        label="Tu nombre"
        name="full_name"
        autoComplete="name"
        required
        defaultValue={state.values?.full_name}
        error={state.fieldErrors?.full_name}
      />
      <Field
        label="Correo"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="tu@correo.com"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <PasswordField
        label="Contraseña"
        name="password"
        autoComplete="new-password"
        required
        hint="Mínimo 8 caracteres, con letras y números."
        error={state.fieldErrors?.password}
      />
      <Field
        label="Nombre de tu negocio (opcional)"
        name="business"
        autoComplete="organization"
        placeholder="Ej. Lavadero El Sol"
        hint="Si te uniste por invitación, déjalo vacío."
        defaultValue={state.values?.business}
        error={state.fieldErrors?.business}
      />
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Crear cuenta gratis
      </Button>
    </form>
  );
}
