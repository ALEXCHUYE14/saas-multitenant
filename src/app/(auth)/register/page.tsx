import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";
import { BILLING } from "@/lib/billing";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Crea tu cuenta</h1>
      <p className="mt-1.5 text-sm text-ink-2">
        {BILLING.trialDays} días gratis, sin tarjeta. Tu negocio tendrá su propio espacio privado.
      </p>

      <RegisterForm />

      <p className="mt-7 text-center text-sm text-ink-2">
        ¿Ya tienes cuenta?{" "}
        <Link prefetch={false} href="/login" className="font-medium text-accent-text hover:underline">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
