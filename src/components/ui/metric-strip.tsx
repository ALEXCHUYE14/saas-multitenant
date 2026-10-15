import { cn } from "@/lib/cn";

export type Metric = {
  label: string;
  value: string;
  /** Variación vs. periodo anterior, ej. +12 o -3 (en %) */
  delta?: number;
  note?: string;
  /** La cifra principal del día: lleva el acento. Solo una por tira. */
  primary?: boolean;
};

/**
 * Tira de métricas: un solo panel dividido, no tarjetas sueltas.
 * Móvil: 2 columnas; escritorio: todas en fila. Cifras tabulares.
 */
export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <section
      aria-label="Indicadores"
      className="grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-surface lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none"
    >
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className={cn(
            "relative flex min-w-0 flex-col gap-1 p-4 sm:p-5",
            // divisores internos: verticales en fila, horizontales al apilar
            i % 2 === 1 && "border-l border-line",
            i >= 2 && "border-t border-line lg:border-t-0",
            i > 0 && "lg:border-l",
            // cantidad impar: la última ocupa la fila entera en móvil (sin hueco vacío)
            metrics.length % 2 === 1 && i === metrics.length - 1 && "col-span-2 lg:col-span-1",
          )}
        >
          <span className="text-sm text-ink-2">{m.label}</span>
          <span
            className={cn(
              // xl en móvil: "S/ 12,345.50" cabe en media pantalla de 320px; nunca se corta.
              "tabular text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl xl:text-figure",
              m.primary && "text-accent",
            )}
          >
            {m.value}
          </span>
          <span className="flex items-center gap-2 text-xs text-ink-3">
            {typeof m.delta === "number" && (
              <span className={cn("tabular font-medium", m.delta >= 0 ? "text-ok" : "text-danger")}>
                {m.delta >= 0 ? "+" : "−"}
                {Math.abs(m.delta)}%
              </span>
            )}
            {m.note}
          </span>
          {m.primary && <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent sm:inset-x-5" />}
        </div>
      ))}
    </section>
  );
}
