import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowRight,
  Armchair,
  Beef,
  Boxes,
  Car,
  ChartColumn,
  Check,
  HandCoins,
  MessageCircle,
  ShoppingBasket,
  ShoppingCart,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { hasAuthCookie } from "@/lib/supabase/auth-cookie";
import { Logo } from "@/components/logo";
import { BILLING, whatsappLink } from "@/lib/billing";

export const metadata: Metadata = {
  title: { absolute: "Panel · Sistema de ventas para restaurantes, bodegas, carwash y carnicerías" },
  description: `Vende, cobra, controla tu inventario y tus fiados desde el celular. ${BILLING.trialDays} días gratis, sin tarjeta.`,
};

// Página pública siempre en claro: también la barra del navegador móvil.
export const viewport: Viewport = { themeColor: "#ffffff" };

const RUBROS = [
  { Icon: UtensilsCrossed, name: "Restaurantes", text: "Mesas, pedidos con notas para cocina y precuenta." },
  { Icon: ShoppingBasket, name: "Bodegas", text: "Código de barras, stock al día y fiados por cliente." },
  { Icon: Car, name: "Carwash", text: "Servicios por vehículo y clientes frecuentes." },
  { Icon: Beef, name: "Carnicerías", text: "Venta por kilo con decimales y control de mermas." },
];

const FEATURES = [
  { Icon: ShoppingCart, title: "Ventas y caja", text: "Cobra en efectivo, Yape, Plin o tarjeta. Abre y cierra caja con el cuadre automático." },
  { Icon: Boxes, title: "Inventario", text: "El stock baja solo con cada venta. Avisos de productos por reponer y kardex completo." },
  { Icon: HandCoins, title: "Fiados", text: "Vende al crédito, registra abonos y mira en un clic quién te debe y cuánto." },
  { Icon: Armchair, title: "Mesas y pedidos", text: "Varios mozos a la vez desde su celular, notas por plato y cobro por mesa." },
  { Icon: ChartColumn, title: "Reportes", text: "Ventas por día, productos más vendidos, ganancia estimada y ventas por vendedor." },
  { Icon: Users, title: "Equipo y roles", text: "Propietario, administración y personal. Cada uno ve solo lo que le corresponde." },
];

const STEPS = [
  { title: "Crea tu cuenta", text: "En un minuto, con tu correo. Sin tarjeta ni instalaciones." },
  { title: "Registra tus productos", text: "Con precio, stock y código de barras si tienes." },
  { title: "Empieza a vender", text: "Desde el celular, la tablet o la PC del mostrador." },
];

const FAQ = [
  {
    q: "¿Necesito tarjeta para la prueba?",
    a: `No. Tienes ${BILLING.trialDays} días con todas las funciones. Si te gusta, pagas ${BILLING.priceLabel} al mes.`,
  },
  {
    q: "¿Cómo pago la suscripción?",
    a: "Con Yape, Plin, transferencia bancaria o tarjeta (cobro mensual automático). Reportas tu pago y tu acceso sigue sin interrupciones.",
  },
  {
    q: "¿Funciona en el celular?",
    a: "Sí. Está pensado para el celular del mostrador, y también funciona en tablet y PC. No hay que instalar nada.",
  },
  {
    q: "¿Qué pasa si dejo de pagar?",
    a: "Tu acceso se pausa, pero tus datos se conservan. Cuando renuevas, todo sigue donde lo dejaste.",
  },
  {
    q: "¿Emite boletas o facturas electrónicas (SUNAT)?",
    a: "No. El sistema imprime notas de venta internas para tus clientes, que no reemplazan a un comprobante electrónico.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Cada negocio tiene su espacio aislado: nadie más puede ver tu información, ni siquiera otros negocios de la plataforma.",
  },
];

/**
 * Solo para el texto de los botones ("Ir a mi panel" / "Probar gratis"): basta con
 * saber si hay cookie de sesión, sin consultar a Supabase en cada visita (la
 * landing la ven también bots y anónimos). Si la sesión expiró, /dashboard lleva al login.
 */
async function hasSession() {
  return hasAuthCookie((await cookies()).getAll());
}

const primaryBtn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-control bg-accent px-6 font-medium text-accent-ink shadow-sm transition-[filter] hover:brightness-105 active:brightness-95";
const secondaryBtn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-control border border-line bg-surface px-6 font-medium text-ink transition-colors hover:border-ink-3 hover:bg-surface-2";

export default async function Home() {
  const loggedIn = await hasSession();
  const primary = loggedIn
    ? { href: "/dashboard", label: "Ir a mi panel" }
    : { href: "/register", label: `Probar ${BILLING.trialDays} días gratis` };

  return (
    <div className="theme-light min-h-dvh bg-bg text-ink">
      {/* Cabecera */}
      <header className="sticky top-0 z-30 border-b border-line/80 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link prefetch={false} href="/" aria-label="Inicio" className="rounded-control">
            <Logo />
          </Link>
          <nav aria-label="Secciones" className="hidden items-center gap-7 text-sm text-ink-2 md:flex">
            <a href="#funciones" className="hover:text-ink">Funciones</a>
            <a href="#como-funciona" className="hover:text-ink">Cómo funciona</a>
            <a href="#precio" className="hover:text-ink">Precio</a>
            <a href="#preguntas" className="hover:text-ink">Preguntas</a>
          </nav>
          <div className="flex items-center gap-2">
            {!loggedIn && (
              <Link
                prefetch={false}
                href="/login"
                className="inline-flex h-10 items-center rounded-control px-3 text-sm font-medium text-ink-2 hover:text-ink"
              >
                Iniciar sesión
              </Link>
            )}
            <Link
              prefetch={false}
              href={primary.href}
              className="inline-flex h-10 items-center rounded-control bg-accent px-4 text-sm font-medium text-accent-ink hover:brightness-105"
            >
              {loggedIn ? "Mi panel" : "Empezar gratis"}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Portada */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-48 left-1/2 size-[48rem] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
            style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20 lg:pb-28">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-2 shadow-sm">
                <span className="size-2 rounded-full bg-ok" aria-hidden />
                {BILLING.trialDays} días gratis · sin tarjeta
              </p>
              <h1 className="mt-5 text-[2.5rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-[3.25rem]">
                Vende, cobra y controla tu negocio <span className="text-accent-text">desde el celular.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2 text-pretty">
                Caja, inventario, fiados, mesas y reportes en un solo sistema. Hecho para restaurantes, bodegas,
                carwash y carnicerías del Perú.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link prefetch={false} href={primary.href} className={primaryBtn}>
                  {primary.label}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                {!loggedIn && (
                  <Link prefetch={false} href="/login" className={secondaryBtn}>
                    Ya tengo cuenta
                  </Link>
                )}
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
                {["Sin instalar nada", "Funciona en celular, tablet y PC", "Soporte por WhatsApp"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-ok" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <ProductPreview />
          </div>
        </section>

        {/* Rubros */}
        <section aria-labelledby="rubros" className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="rubros" className="text-center text-sm font-semibold tracking-wide text-accent-text uppercase">
              Hecho para tu rubro
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {RUBROS.map(({ Icon, name, text }) => (
                <li key={name} className="rounded-panel border border-line bg-bg p-5">
                  <span className="grid size-11 place-items-center rounded-control bg-accent-soft text-accent-text">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold">{name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Funciones */}
        <section id="funciones" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">Todo lo que necesitas para el día a día</h2>
            <p className="mt-3 text-lg text-ink-2">Sin módulos extra ni costos ocultos: todas las funciones están incluidas.</p>
          </div>
          <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-control border border-line bg-surface text-accent-text shadow-sm">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" className="scroll-mt-20 border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Empieza a vender hoy</h2>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="grid size-10 place-items-center rounded-full bg-ink text-sm font-semibold text-surface tabular">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-ink-2">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Precio */}
        <section id="precio" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Un solo precio, todo incluido</h2>
              <p className="mt-3 text-lg text-ink-2">
                Sin contratos ni costos de instalación. Usuarios ilimitados para todo tu equipo. Cancela cuando quieras.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-16px_rgba(16,24,40,0.16)] sm:p-8">
              <p className="text-sm font-semibold text-ink-2">Plan negocio</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-5xl font-semibold tracking-tight tabular">{BILLING.priceLabel}</span>
                <span className="text-ink-2">/ mes por negocio</span>
              </p>
              <ul className="mt-6 grid gap-3 text-sm">
                {[
                  `${BILLING.trialDays} días gratis, sin tarjeta`,
                  "Ventas, caja, inventario, fiados, mesas y reportes",
                  "Usuarios ilimitados con roles",
                  "Paga con Yape, Plin, transferencia o tarjeta",
                  "Tus datos se conservan aunque pauses",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <Link prefetch={false} href={primary.href} className={`${primaryBtn} mt-8 w-full`}>
                {primary.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* Preguntas frecuentes */}
        <section id="preguntas" className="scroll-mt-20 border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Preguntas frecuentes</h2>
            <div className="mt-10 divide-y divide-line rounded-panel border border-line bg-bg">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-ink-3 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Llamado final */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-8 rounded-2xl bg-ink px-6 py-10 text-surface sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ordena tu negocio desde hoy.</h2>
              <p className="mt-2 text-surface/80">{BILLING.trialDays} días gratis. Sin tarjeta. Configúralo en minutos.</p>
            </div>
            <Link prefetch={false} href={primary.href} className={`${primaryBtn} shrink-0`}>
              {primary.label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Logo />
            <span className="text-ink-3">© {new Date().getFullYear()} · Hecho en Perú</span>
          </div>
          <a
            href={whatsappLink("Hola, quiero más información sobre el sistema.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-medium hover:text-ink"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp {BILLING.whatsappLabel}
          </a>
        </div>
      </footer>
    </div>
  );
}

/** Vista previa ilustrativa del panel (decorativa: datos de ejemplo). */
function ProductPreview() {
  const sales = [
    ["Lomo saltado x2", "Efectivo", "56.00"],
    ["Lavado completo", "Yape", "35.00"],
    ["Carne molida 1.5 kg", "Plin", "42.00"],
    ["Inca Kola 1L x3", "Efectivo", "25.50"],
  ];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_60px_-20px_rgba(16,24,40,0.25)]">
        <div className="flex items-center gap-1.5 border-b border-line bg-bg px-4 py-3">
          <span className="size-2.5 rounded-full bg-line" />
          <span className="size-2.5 rounded-full bg-line" />
          <span className="size-2.5 rounded-full bg-line" />
          <span className="ml-3 truncate text-xs text-ink-3">Resumen · Mi negocio</span>
        </div>
        <div className="grid grid-cols-2 border-b border-line">
          <div className="min-w-0 p-5">
            <p className="text-xs text-ink-3">Vendido hoy</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-accent-text tabular sm:text-2xl">S/ 1,284.50</p>
            <p className="mt-1 text-xs font-medium text-ok">+12% vs. ayer</p>
          </div>
          <div className="min-w-0 border-l border-line p-5">
            <p className="text-xs text-ink-3">Ventas de hoy</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular sm:text-2xl">38</p>
            <p className="mt-1 text-xs text-ink-3">3 por reponer</p>
          </div>
        </div>
        <ul className="divide-y divide-line">
          {sales.map(([name, method, total]) => (
            <li key={name} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{name}</span>
                <span className="text-xs text-ink-3">{method}</span>
              </span>
              <span className="shrink-0 tabular font-medium">S/ {total}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -bottom-5 -left-3 hidden rounded-panel border border-line bg-surface px-4 py-3 shadow-lg sm:block">
        <p className="text-xs text-ink-3">Caja</p>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="size-2 rounded-full bg-ok" />
          Abierta · cuadra exacto
        </p>
      </div>
    </div>
  );
}
