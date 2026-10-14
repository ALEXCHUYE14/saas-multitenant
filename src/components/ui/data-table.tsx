import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** Oculta la columna en pantallas pequeñas (la info sigue en la vista móvil). */
  hideOnMobile?: boolean;
  className?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Vista apilada para móvil: título + detalle por fila. */
  mobileRow: (row: T) => { title: React.ReactNode; meta?: React.ReactNode; aside?: React.ReactNode };
  empty?: React.ReactNode;
  caption?: string;
};

/**
 * Tabla de datos server-side. En móvil se convierte en lista (sin scroll
 * horizontal); en escritorio, tabla con cabecera fija y cifras tabulares.
 */
export function DataTable<T>({ columns, rows, rowKey, mobileRow, empty, caption }: Props<T>) {
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface">
      {/* Móvil */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => {
          const r = mobileRow(row);
          return (
            <li key={rowKey(row)} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.title}</div>
                {r.meta && <div className="truncate text-xs text-ink-3">{r.meta}</div>}
              </div>
              {r.aside && <div className="shrink-0">{r.aside}</div>}
            </li>
          );
        })}
      </ul>

      {/* Escritorio */}
      <table className="hidden w-full text-sm md:table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("h-10 px-4 font-medium", c.align === "right" && "text-right", c.hideOnMobile && "hidden lg:table-cell")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-surface-2/60">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "h-12 px-4",
                    c.align === "right" && "tabular text-right",
                    c.hideOnMobile && "hidden lg:table-cell",
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Búsqueda por GET: funciona sin JS y deja la URL compartible. */
export function TableSearch({ defaultValue, placeholder = "Buscar" }: { defaultValue?: string; placeholder?: string }) {
  return (
    <form role="search" className="relative w-full sm:max-w-xs">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-control border border-line bg-surface pr-3 pl-9 text-base outline-none placeholder:text-ink-3 focus:border-accent sm:text-sm"
      />
    </form>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const linkCls =
    "grid size-9 place-items-center rounded-control border border-line text-ink-2 hover:text-ink aria-disabled:pointer-events-none aria-disabled:opacity-40";

  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between text-sm text-ink-2">
      <span className="tabular">
        {from}–{to} de {total}
      </span>
      <div className="flex gap-2">
        <Link href={hrefFor(page - 1)} aria-disabled={page <= 1} className={linkCls} aria-label="Página anterior">
          <ChevronLeft className="size-4" />
        </Link>
        <Link href={hrefFor(page + 1)} aria-disabled={page >= pages} className={linkCls} aria-label="Página siguiente">
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </nav>
  );
}
