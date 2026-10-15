"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { Plus, ShoppingBag } from "lucide-react";
import { createTable, openOrder, setTableActive, type TableFormState } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatCents } from "@/lib/format";

export type TableCard = { id: string; name: string; order: { id: string; cents: number; items: number; since: string } | null };
export type LooseOrder = { id: string; label: string; cents: number; items: number; since: string };

export function TablesBoard({ tables, loose }: { tables: TableCard[]; loose: LooseOrder[] }) {
  const { organization, href } = useTenant();
  const [pending, start] = useTransition();

  const open = (tableId: string | null, label?: string) =>
    start(async () => {
      // Si todo va bien, openOrder redirige al pedido.
      const res = await openOrder(organization.slug, tableId, label);
      if (res?.error) alert(res.error);
    });

  return (
    <div className="grid gap-8">
      {tables.length === 0 ? (
        <p className="text-sm text-ink-2">Aún no hay mesas. Créalas abajo, en «Administrar mesas».</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tables.map((t) => (
            <li key={t.id}>
              {t.order ? (
                <Link prefetch={false}
                  href={href(`/tables/${t.order.id}`)}
                  className="flex h-28 flex-col justify-between rounded-panel border border-accent bg-accent-soft p-3 hover:brightness-105"
                >
                  <span className="font-semibold">{t.name}</span>
                  <span>
                    <span className="block tabular text-lg font-semibold">{formatCents(t.order.cents)}</span>
                    <span className="text-xs text-ink-2">
                      {t.order.items} {t.order.items === 1 ? "producto" : "productos"} · desde {t.order.since}
                    </span>
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => open(t.id)}
                  className="flex h-28 w-full flex-col justify-between rounded-panel border border-line bg-surface p-3 text-left hover:border-accent disabled:opacity-60"
                >
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-sm text-ok">Libre · tocar para abrir</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Para llevar y otros pedidos</h2>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              const label = prompt("Nombre del pedido (ej.: Juan, Delivery 2):", "Para llevar");
              if (label !== null) open(null, label);
            }}
          >
            <ShoppingBag className="size-4" />
            Nuevo pedido
          </Button>
        </div>
        {loose.length === 0 ? (
          <p className="text-sm text-ink-3">No hay pedidos sin mesa abiertos.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {loose.map((o) => (
              <li key={o.id}>
                <Link prefetch={false}
                  href={href(`/tables/${o.id}`)}
                  className="flex h-24 flex-col justify-between rounded-panel border border-accent bg-accent-soft p-3 hover:brightness-105"
                >
                  <span className="truncate font-semibold">{o.label}</span>
                  <span className="text-xs text-ink-2">
                    <span className="block tabular text-base font-semibold text-ink">{formatCents(o.cents)}</span>
                    desde {o.since}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ManageTables({ tables }: { tables: { id: string; name: string; active: boolean; busy: boolean }[] }) {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<TableFormState, FormData>(createTable.bind(null, organization.slug), {});
  const [toggling, start] = useTransition();

  return (
    <details className="rounded-panel border border-line bg-surface p-4 sm:p-6">
      <summary className="cursor-pointer font-semibold">Administrar mesas</summary>
      <form key={state.savedAt ?? state.name ?? ""} action={action} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
        <Field
          label="Nueva mesa"
          name="name"
          maxLength={30}
          placeholder="Mesa 1, Terraza 2, Barra…"
          defaultValue={state.name}
          error={state.error}
          hint={state.saved ? "Mesa creada." : undefined}
          className="flex-1"
        />
        <Button type="submit" loading={pending} className="sm:mt-[1.625rem] sm:h-11">
          <Plus className="size-4" />
          Agregar
        </Button>
      </form>
      {tables.length > 0 && (
        <ul className="mt-5 divide-y divide-line text-sm">
          {tables.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className={cn(!t.active && "text-ink-3 line-through")}>{t.name}</span>
              <button
                type="button"
                disabled={toggling || (t.active && t.busy)}
                title={t.active && t.busy ? "Tiene una cuenta abierta" : undefined}
                onClick={() =>
                  start(async () => {
                    const res = await setTableActive(organization.slug, t.id, !t.active);
                    if (res.error) alert(res.error);
                  })
                }
                className="text-ink-2 underline underline-offset-4 hover:text-ink disabled:no-underline disabled:opacity-40"
              >
                {t.active ? "Desactivar" : "Reactivar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
