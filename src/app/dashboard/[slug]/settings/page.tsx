import type { Metadata } from "next";
import { getTenantContext } from "@/lib/tenant";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { OrgNameForm } from "./org-name-form";
import { TicketSettingsForm } from "./ticket-form";
import type { OrgPlan, OrgStatus } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Ajustes" };

const PLAN_LABEL: Record<OrgPlan, string> = { free: "Gratis", starter: "Inicial", pro: "Pro", enterprise: "Empresa" };
const STATUS_LABEL: Record<OrgStatus, string> = {
  trialing: "En prueba",
  active: "Activo",
  past_due: "Pago pendiente",
  suspended: "Suspendido",
  canceled: "Cancelado",
};

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { organization } = await getTenantContext(slug, { require: "org:update", onForbidden: "redirect" });

  return (
    <>
      <PageHeader title="Ajustes" description="Datos generales del negocio." />

      <div className="grid gap-6">
        <OrgNameForm initialName={organization.name} />
        <TicketSettingsForm />

        <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <h2 className="font-semibold">Dirección del panel</h2>
          <p className="mt-1 text-sm text-ink-2">
            Tu equipo entra por <span className="font-medium text-ink">/dashboard/{organization.slug}</span>. Para cambiarla,
            escribe a soporte: los enlaces guardados dejarían de funcionar.
          </p>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-4 sm:p-6">
          <div>
            <h2 className="font-semibold">Plan</h2>
            <p className="mt-1 text-sm text-ink-2">El plan y la facturación los gestiona el propietario.</p>
          </div>
          <Badge tone={organization.status === "active" ? "ok" : organization.status === "past_due" ? "warn" : "accent"}>
            {PLAN_LABEL[organization.plan]}, {STATUS_LABEL[organization.status].toLowerCase()}
          </Badge>
        </section>
      </div>
    </>
  );
}
