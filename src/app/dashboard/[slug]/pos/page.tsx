import type { Metadata } from "next";
import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { OpenCashForm } from "../cash/cash-forms";
import { PosClient } from "./pos-client";

export const metadata: Metadata = { title: "Vender" };

export default async function PosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug, { require: "sales:create" });
  const supabase = await createClient();

  const [{ data: session, error }, products] = await Promise.all([
    supabase.from("cash_sessions").select("id").is("closed_at", null).maybeSingle(),
    supabase
      .from("products")
      .select("id, name, code, category, unit, price, track_stock, stock, low_stock")
      .eq("active", true)
      .order("name")
      .limit(2000),
  ]);
  if (error) throw new Error(error.message);
  if (products.error) throw new Error(products.error.message);

  return (
    <>
      <PageHeader
        title="Vender"
        actions={
          session && (
            <Link
              href={`/dashboard/${slug}/cash`}
              className="inline-flex h-10 items-center rounded-control border border-line px-4 text-sm text-ink-2 hover:text-ink"
            >
              Caja abierta · Cerrar
            </Link>
          )
        }
      />
      {session ? (
        <PosClient
          products={products.data ?? []}
          canDiscount={can(ctx.role, "sales:discount")}
          canCredit={can(ctx.role, "credit:sell")}
        />
      ) : (
        <OpenCashForm />
      )}
    </>
  );
}
