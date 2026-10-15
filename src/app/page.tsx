import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Beef, Car, ShieldCheck, ShoppingBasket, Smartphone, Users, UtensilsCrossed } from "lucide-react";
import { cookies } from "next/headers";
import { hasAuthCookie } from "@/lib/supabase/auth-cookie";
import { Logo } from "@/components/logo";
import { BILLING } from "@/lib/billing";

export const metadata: Metadata = {
  title: { absolute: "Panel · Sistema para restaurantes, bodegas, carwash y carnicerías" },
  description:
    "Clientes, ventas y equipo de tu negocio en un solo panel. Funciona desde el celular del mostrador. Crea tu cuenta gratis.",
};

const RUBROS = [
  { Icon: UtensilsCrossed, name: "Restaurantes", text: "Mesas, pedidos y la caja del día sin cuadernos." },
  { Icon: ShoppingBasket, name: "Bodegas", text: "Productos, stock y fiados de cada cliente." },
  { Icon: Car, name: "Carwash", text: "Servicios por vehículo y clientes frecuentes." },
  { Icon: Beef, name: "Carnicerías", text: "Venta por peso y control de lo que entra y sale." },
];

const VENTAJAS = [
  { Icon: Smartphone, title: "Desde el celular", text: "Pensado para el mostrador: funciona en el teléfono, la tablet o la PC." },
  { Icon: Users, title: "Tu equipo con roles", text: "Propietario, administración y personal. Cada uno ve solo lo que le toca." },
  { Icon: ShieldCheck, title: "Tus datos, solo tuyos", text: "Cada negocio tiene su espacio aislado. Nadie más puede ver tu información." },
];

/**
 * Solo para elegir el texto del botón ("Ir a mi panel" / "Crear cuenta"): basta
 * con saber si hay cookie de sesión, sin consultar a Supabase en cada visita
 * (la landing la ven también bots y anónimos). Si la sesión expiró, /dashboard
 * igual lleva al login.
 */
async function hasSession() {
  return hasAuthCookie((await cookies()).getAll());
}

export default async function Home() {
  const loggedIn = await hasSession();
  const primary = loggedIn
    ? { href: "/dashboard", label: "Ir a mi panel" }
    : { href: "/register", label: "Crear cuenta gratis" };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          {!loggedIn && (
            <Link prefetch={false} href="/login" className="inline-flex h-9 items-center rounded-control px-3 text-sm text-ink-2 hover:text-ink">
              Iniciar sesión
            </Link>
          )}
          <Link prefetch={false}
            href={primary.href}
            className="inline-flex h-9 items-center rounded-control bg-accent px-3 text-sm font-medium text-accent-ink hover:brightness-105"
          >
            {loggedIn ? "Mi panel" : "Empezar"}
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
          <div>
            <p className="text-sm font-medium text-accent">Para negocios de barrio que quieren ordenarse</p>
            <h1 className="mt-3 text-[2.25rem] leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
              Tu negocio en un solo panel, desde el mostrador.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2 text-pretty">
              Registra clientes, organiza a tu equipo y mira cómo va tu negocio cada día. Sin instalar nada y sin
              cuadernos.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link prefetch={false}
                href={primary.href}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 font-medium text-accent-ink hover:brightness-105"
              >
                {primary.label}
                <ArrowRight className="size-4" />
              </Link>
              {!loggedIn && (
                <Link prefetch={false}
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-control border border-line px-5 font-medium text-ink hover:border-ink-3"
                >
                  Ya tengo cuenta
                </Link>
              )}
            </div>
            {!loggedIn && (
              <p className="mt-4 text-sm text-ink-3">
                {BILLING.trialDays} días gratis, sin tarjeta. Luego {BILLING.priceLabel} al mes.
              </p>
            )}
          </div>

          <Ticket />
        </section>

        {/* Rubros */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Hecho para tu rubro</h2>
            <p className="mt-2 max-w-xl text-ink-2">Una sola plataforma que se adapta a cómo trabaja cada tipo de negocio.</p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {RUBROS.map(({ Icon, name, text }) => (
                <li key={name} className="rounded-panel border border-line bg-bg p-5">
                  <span className="grid size-10 place-items-center rounded-control bg-accent-soft text-accent">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{name}</h3>
                  <p className="mt-1 text-sm text-ink-2">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Ventajas */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <ul className="grid gap-10 md:grid-cols-3">
            {VENTAJAS.map(({ Icon, title, text }) => (
              <li key={title}>
                <Icon className="size-6 text-accent" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink-2">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Precio */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Un solo precio, todo incluido</h2>
              <p className="mt-2 text-ink-2">
                Ventas, caja, inventario, fiados, mesas, reportes y usuarios ilimitados. Sin contratos: cancela cuando quieras.
              </p>
            </div>
            <div className="rounded-panel border border-line bg-bg p-6">
              <p className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold tabular">{BILLING.priceLabel}</span>
                <span className="text-ink-2">al mes por negocio</span>
              </p>
              <ul className="mt-4 grid gap-1.5 text-sm text-ink-2">
                <li>✓ {BILLING.trialDays} días gratis, sin tarjeta</li>
                <li>✓ Paga con tarjeta, Yape, Plin o transferencia</li>
                <li>✓ Tus datos se guardan aunque pauses</li>
              </ul>
              <Link prefetch={false}
                href={primary.href}
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-control bg-accent px-5 font-medium text-accent-ink hover:brightness-105"
              >
                {loggedIn ? "Ir a mi panel" : `Probar ${BILLING.trialDays} días gratis`}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Cierre */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-panel bg-accent-soft p-6 sm:p-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Empieza hoy, gratis.</h2>
              <p className="mt-1 text-ink-2">Crea tu negocio, invita a tu equipo y registra a tus primeros clientes.</p>
            </div>
            <Link prefetch={false}
              href={primary.href}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-control bg-accent px-5 font-medium text-accent-ink hover:brightness-105"
            >
              {primary.label}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Panel</span>
          <span>Hecho en Perú</span>
        </div>
      </footer>
    </div>
  );
}

/** Ilustración: un ticket de caja con el resumen del día. */
function Ticket() {
  const rows = [
    ["Lomo saltado x2", "56.00"],
    ["Inca Kola 1L", "8.50"],
    ["Lavado completo", "35.00"],
    ["Carne molida 1kg", "28.00"],
  ];
  return (
    <div aria-hidden className="mx-auto w-full max-w-sm rotate-1 rounded-panel border border-line bg-surface p-6 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Caja de hoy</span>
        <span className="rounded-full bg-ok/12 px-2.5 py-0.5 text-xs font-medium text-ok">Abierta</span>
      </div>
      <ul className="mt-5 grid gap-2.5 border-y border-dashed border-line py-4 text-sm">
        {rows.map(([name, price]) => (
          <li key={name} className="flex justify-between gap-4">
            <span className="text-ink-2">{name}</span>
            <span className="tabular">S/ {price}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm text-ink-2">Total vendido</span>
        <span className="tabular text-[2.25rem] leading-none font-semibold text-accent">S/ 127.50</span>
      </div>
    </div>
  );
}
