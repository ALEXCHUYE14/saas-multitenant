import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Pagination, TableSearch } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatCents, formatMoney, toCents } from "@/lib/format";
import { CustomerForm } from "./customer-form";
import { DeleteCustomerButton } from "./delete-button";
import type { Customer } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Clientes" };

const PAGE_SIZE = 20;
const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric" });

type SP = Promise<{ q?: string; page?: string; new?: string; edit?: string; view?: string }>;

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  const { q = "", page: pageParam, new: isNew, edit: editId, view } = await searchParams;
  const debtView = view === "debt";
  const ctx = await getTenantContext(slug, { require: "customers:read" });
  const canDelete = can(ctx.role, "customers:delete");
  const canWrite = can(ctx.role, "customers:write");

  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const term = q.trim().slice(0, 60);

  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (term) {
    // Escapa comodines y separadores de PostgREST antes de usar ilike/or.
    const safe = term.replace(/[%_,()\\]/g, " ");
    query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,document_id.ilike.%${safe}%`);
  }

  const [{ data, count, error }, editing, debts] = await Promise.all([
    query,
    canWrite && editId && z.uuid().safeParse(editId).success
      ? supabase.from("customers").select("*").eq("id", editId).maybeSingle()
      : null,
    supabase.rpc("customer_debts"),
  ]);
  if (error) throw new Error(error.message);
  const editingCustomer = editing?.data ?? null;
  const showForm = Boolean((isNew && canWrite) || editingCustomer);

  // Fiados: si la migración aún no está aplicada, la vista simplemente queda vacía.
  const allDebts = (debts.data ?? []).filter((d) => d.debt > 0);
  const totalDebtCents = allDebts.reduce((a, d) => a + toCents(d.debt), 0);
  const termLower = term.toLowerCase();
  const debtRows = termLower
    ? allDebts.filter((d) => d.full_name.toLowerCase().includes(termLower) || d.phone?.includes(term))
    : allDebts;

  const base = `/dashboard/${slug}/customers`;
  const hrefFor = (p: number) => `${base}?${new URLSearchParams({ ...(term && { q: term }), page: String(p) })}`;
  const nameLink = (id: string, name: string) => (
    <Link prefetch={false} href={`${base}/${id}`} className="font-medium hover:underline">
      {name}
    </Link>
  );

  const rowActions = (r: Customer) => (
    <div className="flex justify-end gap-1">
      {canWrite && (
        <Link prefetch={false}
          href={`${base}?edit=${r.id}`}
          className="grid size-10 place-items-center sm:size-8 rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label={`Editar a ${r.full_name}`}
        >
          <Pencil className="size-4" />
        </Link>
      )}
      {canDelete && <DeleteCustomerButton slug={slug} id={r.id} name={r.full_name} />}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Personas y empresas que atiende tu negocio."
        actions={
          canWrite && !showForm && (
            <Link prefetch={false}
              href={`${base}?new=1`}
              className="inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-ink hover:brightness-105"
            >
              <Plus className="size-4" />
              Registrar cliente
            </Link>
          )
        }
      />

      {/* key: al pasar de un cliente a otro el formulario se reinicia (estado y valores). */}
      {showForm && <CustomerForm key={editingCustomer?.id ?? "new"} customer={editingCustomer ?? undefined} />}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filtro" className="flex max-w-full gap-1 self-start overflow-x-auto rounded-control bg-surface-2 p-0.5 text-sm">
          {[
            { key: "all", label: "Todos", href: term ? `${base}?q=${encodeURIComponent(term)}` : base },
            { key: "debt", label: "Con deuda", href: `${base}?view=debt${term ? `&q=${encodeURIComponent(term)}` : ""}` },
          ].map((t) => {
            const active = (t.key === "debt") === debtView;
            return (
              <Link prefetch={false}
                key={t.key}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[0.375rem] px-3 whitespace-nowrap text-ink-2 hover:text-ink",
                  active && "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]",
                )}
              >
                {t.label}
                {t.key === "debt" && allDebts.length > 0 && <Badge tone="warn">{allDebts.length}</Badge>}
              </Link>
            );
          })}
        </nav>
        <TableSearch
          defaultValue={term}
          placeholder="Buscar por nombre, teléfono o documento"
          keep={{ view: debtView ? "debt" : undefined }}
        />
      </div>

      {debtView ? (
        <>
          <p className="mb-3 text-sm text-ink-2">
            Por cobrar en total: <span className="tabular font-semibold text-ink">{formatCents(totalDebtCents)}</span>
          </p>
          <DataTable
            caption="Clientes con deuda"
            rows={debtRows}
            rowKey={(d) => d.customer_id}
            columns={[
              { key: "name", header: "Nombre", cell: (d) => nameLink(d.customer_id, d.full_name) },
              { key: "phone", header: "Teléfono", cell: (d) => d.phone ?? <span className="text-ink-3">—</span>, hideOnMobile: true },
              { key: "last", header: "Último fiado", hideOnMobile: true, cell: (d) => dateFmt.format(new Date(d.last_credit_at)) },
              { key: "debt", header: "Debe", align: "right", cell: (d) => <span className="font-medium text-warn">{formatMoney(d.debt)}</span> },
            ]}
            mobileRow={(d) => ({
              title: nameLink(d.customer_id, d.full_name),
              meta: d.phone ?? undefined,
              aside: <span className="tabular text-sm font-medium text-warn">{formatMoney(d.debt)}</span>,
            })}
            empty={<EmptyState title="Nadie te debe" description="Los clientes con ventas al fiado pendientes aparecerán aquí." />}
          />
        </>
      ) : (
      <DataTable
        caption="Clientes"
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Nombre", cell: (r) => nameLink(r.id, r.full_name) },
          { key: "phone", header: "Teléfono", cell: (r) => r.phone ?? <span className="text-ink-3">—</span> },
          { key: "email", header: "Correo", cell: (r) => r.email ?? <span className="text-ink-3">—</span>, hideOnMobile: true },
          { key: "doc", header: "DNI / RUC", cell: (r) => <span className="tabular">{r.document_id ?? "—"}</span>, hideOnMobile: true },
          { key: "date", header: "Registro", align: "right", cell: (r) => dateFmt.format(new Date(r.created_at)) },
          ...(canWrite || canDelete
            ? [
                {
                  key: "actions",
                  header: "",
                  align: "right" as const,
                  className: "w-24",
                  cell: rowActions,
                },
              ]
            : []),
        ]}
        mobileRow={(r) => ({
          title: nameLink(r.id, r.full_name),
          meta: [r.phone, r.document_id].filter(Boolean).join(" / ") || undefined,
          aside: canWrite || canDelete ? rowActions(r) : undefined,
        })}
        empty={
          term ? (
            <EmptyState title={`Nada coincide con "${term}"`} description="Prueba con otro nombre, teléfono o documento." />
          ) : (
            <EmptyState title="Aún no hay clientes" description="Registra al primero con el botón de arriba." />
          )
        }
      />

      )}

      {!debtView && (count ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={hrefFor} />}
    </>
  );
}
