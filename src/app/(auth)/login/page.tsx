import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Inicia sesión</h1>
      <p className="mt-1.5 text-sm text-ink-2">Entra al panel de tu negocio.</p>

      {error === "link" && (
        <p role="alert" className="mt-6 rounded-control bg-danger/10 px-3 py-2.5 text-sm text-danger">
          El enlace venció o ya se usó. Inicia sesión o pide uno nuevo.
        </p>
      )}

      <LoginForm next={next} />

      <p className="mt-4 text-sm">
        <Link href="/forgot-password" className="text-ink-2 hover:text-ink">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <p className="mt-8 text-sm text-ink-2">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/register" className="font-medium text-ink underline decoration-accent decoration-2 underline-offset-4">
          Registra tu negocio
        </Link>
      </p>
    </>
  );
}
