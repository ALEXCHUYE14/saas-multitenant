/**
 * Se muestra AL INSTANTE al navegar entre secciones del panel (el menú lateral
 * sigue visible), mientras el servidor prepara la página. Sin esto la app se
 * queda "congelada" en la página anterior hasta tener la nueva completa.
 * Imita la estructura común: encabezado, tira de cifras y un panel.
 */
export default function DashboardLoading() {
  const block = "animate-pulse rounded-control bg-surface-2";
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando…</span>

      <div className="mb-8 grid gap-2">
        <div className={`${block} h-7 w-48 sm:h-8`} />
        <div className={`${block} h-4 w-72 max-w-full`} />
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-surface lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`grid gap-2 p-4 sm:p-5 ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0 lg:border-l" : ""}`}>
            <div className={`${block} h-4 w-24`} />
            <div className={`${block} h-7 w-28`} />
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-3 rounded-panel border border-line bg-surface p-4 sm:p-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className={`${block} h-4 w-1/2`} />
            <div className={`${block} h-4 w-16`} />
          </div>
        ))}
      </div>
    </div>
  );
}
