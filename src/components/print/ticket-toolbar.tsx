"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";

const WIDTH_KEY = "ticket-width";
const WIDTHS = { "58": "48mm", "80": "72mm" } as const; // área imprimible real de cada papel
type Paper = keyof typeof WIDTHS;

/** Barra solo en pantalla: ancho del papel (recordado por dispositivo) e imprimir. */
export function TicketToolbar({ backHref, autoPrint }: { backHref: string; autoPrint: boolean }) {
  const [paper, setPaper] = useState<Paper>("80");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WIDTH_KEY);
      if (saved === "58" || saved === "80") setPaper(saved);
    } catch {}
    setReady(true);
  }, []);

  // Imprime una sola vez, ya con el ancho guardado aplicado.
  useEffect(() => {
    if (!ready || !autoPrint) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [ready, autoPrint]);

  const choose = (p: Paper) => {
    setPaper(p);
    try {
      localStorage.setItem(WIDTH_KEY, p);
    } catch {}
  };

  return (
    <>
      <style>{`
        .ticket { width: ${WIDTHS[paper]}; }
        @media print {
          @page { size: ${paper}mm auto; margin: 0; }
          html, body { background: #fff !important; }
        }
      `}</style>
      <div className="mx-auto mb-4 flex w-fit max-w-[calc(100%-1rem)] flex-wrap items-center justify-center gap-2 rounded-panel bg-white p-2 text-sm text-black shadow print:hidden">
        <Link prefetch={false} href={backHref} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 hover:bg-neutral-100">
          <ArrowLeft className="size-4" />
          Volver
        </Link>
        <div role="radiogroup" aria-label="Ancho del papel" className="flex rounded-md bg-neutral-100 p-0.5">
          {(Object.keys(WIDTHS) as Paper[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={paper === p}
              onClick={() => choose(p)}
              className={`h-8 rounded px-3 ${paper === p ? "bg-white font-medium shadow-sm" : "text-neutral-600"}`}
            >
              {p} mm
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-black px-3 font-medium text-white"
        >
          <Printer className="size-4" />
          Imprimir
        </button>
      </div>
    </>
  );
}
