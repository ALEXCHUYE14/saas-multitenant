import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Panel lateral solo en escritorio: qué hace el producto, sin ruido. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-10 lg:flex">
        <Logo />
        <div className="max-w-md">
          <p className="text-2xl leading-snug font-semibold text-balance">
            Ventas, clientes y equipo de tu negocio en un solo panel. Cada empresa ve solo sus propios datos.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-ink-2">
            <li>Lavaderos, ópticas, bodegas y talleres</li>
            <li>Funciona desde el celular del mostrador</li>
            <li>Roles para propietario, administración y personal</li>
          </ul>
        </div>
        <p className="text-xs text-ink-3">© {new Date().getFullYear()}</p>
        {/* Trama sutil: líneas de un ticket de caja. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-24 opacity-40"
          style={{
            backgroundImage: "repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px 14px)",
            maskImage: "linear-gradient(to left, black, transparent)",
          }}
        />
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
