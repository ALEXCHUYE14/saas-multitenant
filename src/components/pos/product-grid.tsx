"use client";

import Link from "next/link";
import { forwardRef, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/cn";
import { formatMoney, formatQty } from "@/lib/format";
import type { Product } from "@/lib/supabase/database.types";

export type PosProduct = Pick<Product, "id" | "name" | "code" | "category" | "unit" | "price" | "track_stock" | "stock" | "low_stock">;

/**
 * Catálogo para vender: búsqueda (acepta lector de código de barras: código + Enter),
 * filtro por categoría y botones de producto. Compartido por Vender y Mesas.
 */
export const ProductGrid = forwardRef<
  HTMLInputElement,
  { products: PosProduct[]; onPick: (p: PosProduct) => void; disabled?: boolean; autoFocus?: boolean }
>(function ProductGrid({ products, onPick, disabled, autoFocus }, searchRef) {
  const { href } = useTenant();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, "es")),
    [products],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!category || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)),
    );
  }, [products, query, category]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q || disabled) return;
    const exact = products.find((p) => p.code?.toLowerCase() === q);
    const target = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (target) {
      onPick(target);
      setQuery("");
    }
  };

  return (
    <section aria-label="Productos" className="min-w-0">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Buscar o escanear código"
          aria-label="Buscar producto o escanear código"
          autoFocus={autoFocus}
          className="h-11 w-full rounded-control border border-line bg-surface pr-3 pl-9 text-base outline-none placeholder:text-ink-3 focus:border-accent sm:text-sm"
        />
      </div>

      {categories.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "__all"}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-sm",
                category === c ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2 hover:text-ink",
              )}
            >
              {c ?? "Todo"}
            </button>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <p className="mt-6 text-sm text-ink-2">
          No hay productos activos.{" "}
          <Link href={href("/products?new=1")} className="underline underline-offset-4">
            Registra el primero
          </Link>
          .
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-ink-2">Nada coincide con la búsqueda.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(p)}
                className="flex h-full w-full flex-col items-start gap-1 rounded-panel border border-line bg-surface p-3 text-left transition-colors hover:border-accent active:bg-surface-2 disabled:opacity-60"
              >
                <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                <span className="mt-auto tabular text-sm text-accent">
                  {formatMoney(p.price)}
                  {p.unit === "kg" || p.unit === "l" ? <span className="text-ink-3"> / {p.unit === "kg" ? "kg" : "L"}</span> : null}
                </span>
                {p.track_stock && (
                  <span className={cn("text-xs text-ink-3", p.low_stock && "text-warn", p.stock <= 0 && "text-danger")}>
                    Stock {formatQty(p.stock, p.unit)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
