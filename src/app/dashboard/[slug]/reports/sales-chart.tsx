"use client";

import { useState } from "react";
import { formatCents } from "@/lib/format";

export type ChartPoint = { key: string; label: string; longLabel: string; cents: number; count: number };

/**
 * Columnas de ventas por periodo. Una sola serie (sin leyenda: el título la nombra).
 * Specs dataviz: columnas ≤ 24px con extremo redondeado de 4px, base recta,
 * 2px de separación, grilla hairline, tooltip en hover y foco, máximo rotulado,
 * y tabla equivalente (el color de barra no llega a 3:1 en modo claro).
 */
export function SalesChart({ points }: { points: ChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((p) => p.cents));
  const maxIndex = points.findIndex((p) => p.cents === max && max > 0);
  // Etiquetas del eje X selectivas: ~6 como máximo.
  const every = Math.max(1, Math.ceil(points.length / 6));

  if (max === 0) {
    return <p className="py-10 text-center text-sm text-ink-3">No hubo ventas en este periodo.</p>;
  }

  return (
    <div>
      <div className="relative">
        {/* Grilla: línea del máximo (rotulado sobre su barra) y base */}
        <div className="pointer-events-none absolute inset-x-0 top-6 border-t border-line" aria-hidden />

        <div className="flex h-56 items-end gap-[2px] border-b border-line pt-6" role="list" aria-label="Ventas por periodo">
          {points.map((p, i) => {
            const pct = (p.cents / max) * 100;
            return (
              <div key={p.key} role="listitem" className="relative flex h-full min-w-0 flex-1 items-end justify-center">
                {i === maxIndex && (
                  <span className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-full text-xs font-medium whitespace-nowrap text-ink tabular">
                    {formatCents(p.cents)}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`${p.longLabel}: ${formatCents(p.cents)}, ${p.count} ventas`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  // Zona de toque de toda la columna; la barra visible es más delgada.
                  className="group flex h-full w-full items-end justify-center outline-offset-2"
                >
                  <span
                    className="block w-full max-w-6 rounded-t-[4px] bg-chart-bar transition-[filter] group-hover:brightness-110 group-focus-visible:brightness-110"
                    style={{ height: p.cents > 0 ? `max(${pct}%, 2px)` : 0 }}
                  />
                </button>
                {active === i && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
                  >
                    <p className="font-medium text-ink">{p.longLabel}</p>
                    <p className="text-ink-2 tabular">
                      {formatCents(p.cents)} · {p.count} {p.count === 1 ? "venta" : "ventas"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-[2px]" aria-hidden>
        {points.map((p, i) => (
          <span key={p.key} className="min-w-0 flex-1 truncate text-center text-[11px] text-ink-3">
            {i % every === 0 || i === points.length - 1 ? p.label : ""}
          </span>
        ))}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">Ver como tabla</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="py-1.5 font-medium">Periodo</th>
              <th className="py-1.5 text-right font-medium">Ventas</th>
              <th className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {points.map((p) => (
              <tr key={p.key}>
                <td className="py-1.5">{p.longLabel}</td>
                <td className="py-1.5 text-right tabular">{p.count}</td>
                <td className="py-1.5 text-right tabular">{formatCents(p.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
