import type { Viewport } from "next";
import Link from "next/link";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Logo } from "@/components/logo";
import { BILLING, whatsappLink } from "@/lib/billing";

// Páginas públicas siempre en claro: la barra del navegador móvil también.
export const viewport: Viewport = { themeColor: "#f6f7f9" };

const BENEFITS = [
  "Vende, cobra y cierra la caja desde el celular",
  "Inventario, fiados, mesas y reportes en un solo lugar",
  "Tu equipo con roles: cada uno ve solo lo que le toca",
];

/**
 * Login, registro y recuperación de contraseña. Siempre en modo claro
 * (`theme-light`). Escritorio: panel de marca + formulario en tarjeta.
 * Móvil: solo el formulario, con el logo arriba.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light grid min-h-dvh bg-bg text-ink lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Panel de marca (solo escritorio) */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 size-[32rem] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
        />
        <Link prefetch={false} href="/" className="relative w-fit rounded-control" aria-label="Ir al inicio">
          <Logo />
        </Link>

        <div className="relative max-w-md">
          <p className="text-sm font-semibold tracking-wide text-accent-text uppercase">Sistema para tu negocio</p>
          <h2 className="mt-3 text-[2rem] leading-tight font-semibold tracking-tight text-balance">
            Todo tu negocio, ordenado en un solo panel.
          </h2>
          <ul className="mt-8 grid gap-4">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3 text-ink-2">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-10 inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-sm text-ink-2">
            <span className="size-2 rounded-full bg-ok" aria-hidden />
            {BILLING.trialDays} días gratis · sin tarjeta · luego {BILLING.priceLabel}/mes
          </p>
        </div>

        <p className="relative flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
          <span>© {new Date().getFullYear()}</span>
          <a
            href={whatsappLink("Hola, tengo una consulta sobre el sistema.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-ink"
          >
            <MessageCircle className="size-4" aria-hidden />
            Soporte {BILLING.whatsappLabel}
          </a>
        </p>
      </aside>

      {/* Formulario */}
      <main className="flex flex-col px-4 py-6 sm:px-8 sm:py-10">
        <div className="lg:hidden">
          <Link prefetch={false} href="/" className="inline-block rounded-control" aria-label="Ir al inicio">
            <Logo />
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.12)] sm:p-8">
            {children}
          </div>
        </div>
        <p className="text-center text-xs text-ink-3 lg:hidden">
          ¿Ayuda?{" "}
          <a
            href={whatsappLink("Hola, tengo una consulta sobre el sistema.")}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            WhatsApp {BILLING.whatsappLabel}
          </a>
        </p>
      </main>
    </div>
  );
}
