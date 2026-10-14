import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";
import { formatMoney, formatQty } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Pagination, TableSearch } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "./product-form";
import { ProductRowActions } from "./product-row-actions";
import type { Product } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Productos" };

const PAGE_SIZE = 25;

const VIEWS = {
  active: "Activos",
  low: "Stock bajo",
  archived: "Archivados",
} as const;
type View = keyof typeof VIEWS;

type SP = Promise<{ q?: string; page?: string; new?: string; edit?: string; view?: string }>;

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug, { require: "products:read" });
  const canWrite = can(ctx.role, "products:write");

  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : "active";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const term = (sp.q ?? "").trim().slice(0, 60);
  const editId = canWrite && sp.edit && z.uuid().safeParse(sp.edit).success ? sp.edit : null;

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .order("name", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (view === "archived") query = query.eq("active", false);
  else query = query.eq("active", true);
  if (view === "low") query = query.eq("low_stock", true);

  if (term) {
    // Escapa comodines y separadores de PostgREST antes de usar ilike/or.
    const safe = term.replace(/[%_,()\\]/g, " ");
    query = query.or(`name.ilike.%${safe}%,code.ilike.%${safe}%,category.ilike.%${safe}%`);
  }

  const [{ data, count, error }, editing, cats, lowCount] = await Promise.all([
    query,
    editId ? supabase.from("products").select("*").eq("id", editId).maybeSingle() : null,
    canWrite ? supabase.from("products").select("category").not("category", "is", null).limit(1000) : null,
    supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true).eq("low_stock", true),
  ]);
  if (error) throw new Error(error.message);

  const editingProduct = editing?.data ?? null;
  const showForm = canWrite && (sp.new === "1" || Boolean(editingProduct));
  const categories = [...new Set((cats?.data ?? []).map((c) => c.category).filter((c): c is string => Boolean(c)))].sort(
    (a, b) => a.localeCompare(b, "es"),
  );

  const base = `/dashboard/${slug}/products`;
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view: view === "active" ? undefined : view, q: term || undefined, ...extra }))
      if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  const stockCell = (r: Product) => {
    if (!r.track_stock) return <span className="text-ink-3">—</span>;
    return (
      <span className={cn("tabular", r.low_stock && "font-medium text-warn", r.stock < 0 && "text-danger")}>
        {formatQty(r.stock, r.unit)}
      </span>
    );
  };

  const rowActions = (r: Product) => (
    <div className="flex justify-end gap-1">
      <Link
        href={qs({ edit: r.id, page: page > 1 ? String(page) : undefined })}
        className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink"
        aria-label={`Editar ${r.name}`}
      >
        <Pencil className="size-4" />
      </Link>
      <ProductRowActions slug={slug} id={r.id} name={r.name} active={r.active} />
    </div>
  );

  const nameCell = (r: Product) => (
    <Link href={`${base}/${r.id}`} className="font-medium hover:underline">
      {r.name}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Productos"
        description="Lo que vendes: productos, platos y servicios, con su precio y stock."
        actions={
          canWrite &&
          !showForm && (
            <Link
              href={`${base}?new=1`}
              className="inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-ink hover:brightness-105"
            >
              <Plus className="size-4" />
              Nuevo producto
            </Link>
          )
        }
      />

      {showForm && (
        // key: al pasar de un producto a otro el formulario se reinicia (estado y valores).
        <ProductForm key={editingProduct?.id ?? "new"} product={editingProduct ?? undefined} categories={categories} />
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filtro" className="flex gap-1 rounded-control bg-surface-2 p-0.5 text-sm">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link
              key={v}
              href={qs({ view: v === "active" ? "" : v })}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[0.375rem] px-3 text-ink-2 hover:text-ink",
                view === v && "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]",
              )}
            >
              {VIEWS[v]}
              {v === "low" && (lowCount.count ?? 0) > 0 && <Badge tone="warn">{lowCount.count}</Badge>}
            </Link>
          ))}
        </nav>
        <TableSearch
          defaultValue={term}
          placeholder="Buscar por nombre, código o categoría"
          keep={{ view: view === "active" ? undefined : view }}
        />
      </div>

      <DataTable
        caption="Productos"
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Nombre", cell: nameCell },
          { key: "category", header: "Categoría", cell: (r) => r.category ?? <span className="text-ink-3">—</span>, hideOnMobile: true },
          { key: "code", header: "Código", cell: (r) => <span className="tabular">{r.code ?? "—"}</span>, hideOnMobile: true },
          { key: "price", header: "Precio", align: "right", cell: (r) => formatMoney(r.price) },
          { key: "stock", header: "Stock", align: "right", cell: stockCell },
          ...(canWrite ? [{ key: "actions", header: "", align: "right" as const, className: "w-32", cell: rowActions }] : []),
        ]}
        mobileRow={(r) => ({
          title: nameCell(r),
          meta: (
            <>
              {formatMoney(r.price)}
              {r.track_stock && <> · Stock {stockCell(r)}</>}
            </>
          ),
          aside: canWrite ? rowActions(r) : undefined,
        })}
        empty={
          term ? (
            <EmptyState title={`Nada coincide con "${term}"`} description="Prueba con otro nombre, código o categoría." />
          ) : view === "low" ? (
            <EmptyState title="Nada por reponer" description="Ningún producto está por debajo de su stock mínimo." />
          ) : view === "archived" ? (
            <EmptyState title="No hay productos archivados" description="Archiva lo que ya no vendes para que no estorbe en la caja." />
          ) : (
            <EmptyState
              title="Aún no hay productos"
              description={canWrite ? "Registra lo que vendes con el botón de arriba." : "El administrador aún no ha registrado productos."}
            />
          )
        }
      />

      {(count ?? 0) > PAGE_SIZE && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(p) => qs({ page: String(p) })} />
      )}
    </>
  );
}
