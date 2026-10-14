import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Pagination, TableSearch } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerForm } from "./customer-form";
import { DeleteCustomerButton } from "./delete-button";
import type { Customer } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Clientes" };

const PAGE_SIZE = 20;
const dateFmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric" });

type SP = Promise<{ q?: string; page?: string; new?: string }>;

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  const { q = "", page: pageParam, new: isNew } = await searchParams;
  const ctx = await getTenantContext(slug, { require: "customers:read" });
  const canDelete = can(ctx.role, "customers:delete");

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

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const base = `/dashboard/${slug}/customers`;
  const hrefFor = (p: number) => `${base}?${new URLSearchParams({ ...(term && { q: term }), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Personas y empresas que atiende tu negocio."
        actions={
          !isNew && (
            <Link
              href={`${base}?new=1`}
              className="inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-ink hover:brightness-105"
            >
              <Plus className="size-4" />
              Registrar cliente
            </Link>
          )
        }
      />

      {isNew && <CustomerForm />}

      <div className="mb-4">
        <TableSearch defaultValue={term} placeholder="Buscar por nombre, teléfono o documento" />
      </div>

      <DataTable
        caption="Clientes"
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Nombre", cell: (r) => <span className="font-medium">{r.full_name}</span> },
          { key: "phone", header: "Teléfono", cell: (r) => r.phone ?? <span className="text-ink-3">—</span> },
          { key: "email", header: "Correo", cell: (r) => r.email ?? <span className="text-ink-3">—</span>, hideOnMobile: true },
          { key: "doc", header: "DNI / RUC", cell: (r) => <span className="tabular">{r.document_id ?? "—"}</span>, hideOnMobile: true },
          { key: "date", header: "Registro", align: "right", cell: (r) => dateFmt.format(new Date(r.created_at)) },
          ...(canDelete
            ? [
                {
                  key: "actions",
                  header: "",
                  align: "right" as const,
                  className: "w-12",
                  cell: (r: Customer) => <DeleteCustomerButton slug={slug} id={r.id} name={r.full_name} />,
                },
              ]
            : []),
        ]}
        mobileRow={(r) => ({
          title: r.full_name,
          meta: [r.phone, r.document_id].filter(Boolean).join(" / ") || undefined,
          aside: canDelete ? <DeleteCustomerButton slug={slug} id={r.id} name={r.full_name} /> : undefined,
        })}
        empty={
          term ? (
            <EmptyState title={`Nada coincide con "${term}"`} description="Prueba con otro nombre, teléfono o documento." />
          ) : (
            <EmptyState title="Aún no hay clientes" description="Registra al primero con el botón de arriba." />
          )
        }
      />

      {(count ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={hrefFor} />}
    </>
  );
}
