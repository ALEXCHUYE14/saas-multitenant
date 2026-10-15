"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { FormAlert } from "@/components/ui/form-alert";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});

  return (
    <form action={action} className="mt-7 grid gap-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormAlert error={state.error} />
      <Field
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="tu@correo.com"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <PasswordField
        label="Contraseña"
        name="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <div className="-mt-2 flex justify-end">
        <Link prefetch={false} href="/forgot-password" className="text-sm font-medium text-accent-text hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Iniciar sesión
      </Button>
    </form>
  );
}
