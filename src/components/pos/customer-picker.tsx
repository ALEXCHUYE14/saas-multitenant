"use client";

import { useEffect, useId, useRef, useState } from "react";
import { UserRound, X } from "lucide-react";
import { searchCustomers, type CustomerOption } from "@/app/dashboard/[slug]/pos/actions";
import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/cn";

/** Selector de cliente con búsqueda en el servidor (debounce + descarte de respuestas viejas). */
export function CustomerPicker({
  value,
  onChange,
  required,
}: {
  value: CustomerOption | null;
  onChange: (c: CustomerOption | null) => void;
  required?: boolean;
}) {
  const { organization } = useTenant();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      requestId.current++;
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await searchCustomers(organization.slug, term);
        if (id === requestId.current) setResults(data);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, organization.slug]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface-2 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <UserRound className="size-4 shrink-0 text-ink-3" />
          <span className="truncate">
            {value.full_name}
            {value.document_id && <span className="text-ink-3"> · {value.document_id}</span>}
          </span>
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label="Quitar cliente" className="text-ink-3 hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={required ? "Cliente (obligatorio para fiar)" : "Cliente (opcional)"}
        aria-label="Buscar cliente"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && results.length > 0}
        className={cn(
          "h-9 w-full rounded-control border bg-surface-2 px-3 text-base outline-none placeholder:text-ink-3 focus:border-accent sm:text-sm",
          required ? "border-warn" : "border-line",
        )}
      />
      {open && q.trim().length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-control border border-line bg-surface shadow-lg"
        >
          {loading && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-3">Buscando…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-3">Sin resultados. Regístralo en Clientes.</li>
          ) : (
            results.map((c) => (
              <li key={c.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  // onMouseDown: se ejecuta antes del blur del input.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(c);
                    setQ("");
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  {c.full_name}
                  <span className="block text-xs text-ink-3">{[c.document_id, c.phone].filter(Boolean).join(" · ") || "—"}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
