import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Crea tu cuenta</h1>
      <p className="mt-1.5 text-sm text-ink-2">Gratis para empezar. Tu negocio tendrá su propio espacio.</p>

      <RegisterForm />

      <p className="mt-8 text-sm text-ink-2">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-ink underline decoration-accent decoration-2 underline-offset-4">
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
