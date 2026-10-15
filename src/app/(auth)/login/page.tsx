import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { BILLING } from "@/lib/billing";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
      <p className="mt-1.5 text-sm text-ink-2">Ingresa para administrar tu negocio.</p>

      {error === "link" && (
        <p role="alert" className="mt-6 rounded-control bg-danger/10 px-3 py-2.5 text-sm text-danger">
          El enlace venció o ya se usó. Inicia sesión o pide uno nuevo.
        </p>
      )}

      <LoginForm next={next} />

      <div className="mt-7 flex items-center gap-3 text-xs text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        ¿Primera vez aquí?
        <span className="h-px flex-1 bg-line" />
      </div>
      <Link
        prefetch={false}
        href="/register"
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-control border border-line bg-surface font-medium text-ink transition-colors hover:border-ink-3 hover:bg-surface-2"
      >
        Crear cuenta · {BILLING.trialDays} días gratis
      </Link>
    </>
  );
}
