import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Recupera tu contraseña</h1>
      <p className="mt-1.5 text-sm text-ink-2">Te enviaremos un enlace para crear una nueva.</p>

      <ForgotPasswordForm />

      <p className="mt-7 text-center text-sm text-ink-2">
        ¿La recordaste?{" "}
        <Link prefetch={false} href="/login" className="font-medium text-accent-text hover:underline">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
