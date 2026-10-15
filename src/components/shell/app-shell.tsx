"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { logout } from "@/app/(auth)/actions";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS } from "./nav";
import { accessUntil, billingPhase, daysLeft } from "@/lib/billing";

const COLLAPSE_KEY = "sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);

  // Cierra el drawer al navegar.
  useEffect(() => setDrawerOpen(false), [pathname]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="-ml-2 grid size-10 place-items-center rounded-control text-ink-2 hover:bg-surface-2"
          aria-label="Abrir menú"
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav"
        >
          <Menu className="size-5" />
        </button>
        <OrgPlate bare />
      </header>

      {/* Sidebar escritorio */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex",
          collapsed ? "w-[4.25rem]" : "w-60",
        )}
      >
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
          <Logo compact={collapsed} />
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label="Contraer menú"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="px-3 pb-3">
            <OrgPlate />
          </div>
        )}
        <SidebarNav collapsed={collapsed} />
        <SidebarFooter collapsed={collapsed} onExpand={toggleCollapsed} />
      </aside>

      {/* Drawer móvil */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="min-w-0 flex-1">
        <BillingBanner />
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

/**
 * Aviso de cobro para el propietario: prueba por terminar (≤ 5 días), periodo de
 * gracia o acceso provisional. Se calcula tras montar (la hora del servidor y la
 * del navegador difieren: evita desajustes de hidratación).
 */
function BillingBanner() {
  const { organization, role } = useTenant();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "owner") return setMsg(null);
    const phase = billingPhase(organization);
    const left = daysLeft(accessUntil(organization));
    const days = `${left} ${left === 1 ? "día" : "días"}`;
    setMsg(
      phase === "trial" && left <= 5
        ? `Tu prueba gratis termina en ${days}. Suscríbete para no perder el acceso.`
        : phase === "grace"
          ? `Tu pago está pendiente. Te quedan ${days} antes de que se pause el acceso.`
          : phase === "provisional"
            ? "Estamos confirmando tu pago. Mientras tanto tienes acceso completo."
            : null,
    );
  }, [organization, role]);

  if (!msg) return null;
  return (
    <div role="status" className="border-b border-warn/30 bg-warn/10">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-6 lg:px-10">
        <span>{msg}</span>
        <Link prefetch={false} href="/billing" className="font-medium underline decoration-2 underline-offset-4">
          Ver suscripción
        </Link>
      </div>
    </div>
  );
}

/** Identidad del tenant activo: nombre + dirección, como una placa. */
function OrgPlate({ bare }: { bare?: boolean }) {
  const { organization } = useTenant();
  return (
    <div className={cn("min-w-0", !bare && "rounded-control border border-line bg-bg/60 px-3 py-2")}>
      <p className="truncate text-sm leading-tight font-semibold">{organization.name}</p>
      <p className="truncate text-xs leading-tight text-ink-3">/{organization.slug}</p>
    </div>
  );
}

function SidebarNav({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { can, href } = useTenant();
  const base = href();

  return (
    <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="grid gap-0.5">
        {NAV_ITEMS.filter((i) => !i.permission || can(i.permission)).map((item) => {
          const to = item.absolute ? item.path : href(item.path);
          const active = item.path === "" ? pathname === base : pathname.startsWith(to);
          return (
            <li key={item.path}>
              <Link prefetch={false}
                href={to}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors",
                  collapsed && "justify-center px-0",
                  active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink",
                )}
              >
                {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
                <item.icon className={cn("size-[1.1rem] shrink-0", active && "text-accent")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarFooter({ collapsed, onExpand }: { collapsed?: boolean; onExpand?: () => void }) {
  const { fullName, email, role, href } = useTenant();
  // Nombre + primer apellido: con 4+ palabras se salta el segundo nombre
  // ("Miguel Alexander Flores Chuye" → "MF"; "Juan Pérez García" → "JP").
  const words = (fullName?.trim() || email || "?").split(/\s+/).filter(Boolean);
  const initials = (words.length >= 4 ? [words[0], words[2]] : words.slice(0, 2))
    .map((w) => w![0])
    .join("")
    .toUpperCase();

  if (collapsed) {
    return (
      <div className="grid justify-items-center gap-1 border-t border-line py-3">
        <ThemeToggle compact />
        <button
          type="button"
          onClick={onExpand}
          className="grid size-9 place-items-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
          aria-label="Expandir menú"
        >
          <PanelLeftOpen className="size-4" />
        </button>
        <Link prefetch={false}
          href={href("/profile")}
          className="mt-1 grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent hover:brightness-105"
          title="Mi perfil"
          aria-label="Mi perfil"
        >
          {initials}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3 border-t border-line p-3">
      <ThemeToggle />
      {/* Fila del usuario: avatar + nombre (a Mi perfil) y salir, centrados en una misma altura. */}
      <div className="flex h-12 items-center gap-2">
        <Link prefetch={false}
          href={href("/profile")}
          title={`${fullName ?? email ?? ""} · Mi perfil`}
          className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-control px-2 hover:bg-surface-2"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
            {initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <span className="truncate text-sm leading-tight font-medium">{fullName ?? email}</span>
            <span className="truncate text-xs leading-tight text-ink-3">{ROLE_LABEL[role]}</span>
          </span>
        </Link>
        <form action={logout} className="flex shrink-0">
          <button
            className="grid size-10 place-items-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, onClose]);

  return (
    <div className={cn("fixed inset-0 z-40 lg:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")}
        onClick={onClose}
      />
      <div
        id="mobile-nav"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        inert={!open}
        className={cn(
          "absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-line bg-surface transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 grid size-10 place-items-center rounded-control text-ink-2 hover:bg-surface-2"
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="px-3 pb-3">
          <OrgPlate />
        </div>
        <SidebarNav />
        <SidebarFooter />
      </div>
    </div>
  );
}
