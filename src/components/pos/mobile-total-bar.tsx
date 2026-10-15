"use client";

import { ChevronDown } from "lucide-react";
import { formatCents } from "@/lib/format";

/**
 * Solo móvil (< md): barra fija inferior con el total que lleva al ticket,
 * que en pantallas chicas queda debajo del catálogo. Respeta el área segura
 * inferior (iPhone). La página debe reservar espacio con `pb-24 md:pb-0`.
 */
export function MobileTotalBar({ count, totalCents, targetId }: { count: number; totalCents: number; targetId: string }) {
  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <button
        type="button"
        onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-control bg-accent px-4 font-medium text-accent-ink"
      >
        <span className="text-sm">
          {count} {count === 1 ? "producto" : "productos"}
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular text-lg font-semibold">{formatCents(totalCents)}</span>
          <span className="flex items-center gap-1 text-sm">
            Cobrar
            <ChevronDown className="size-4" />
          </span>
        </span>
      </button>
    </div>
  );
}
