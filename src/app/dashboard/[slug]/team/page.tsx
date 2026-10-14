import type { Metadata } from "next";
import { getTenantContext } from "@/lib/tenant";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { InviteForm, MemberControls, RevokeInvitation } from "./team-client";

export const metadata: Metadata = { title: "Equipo" };

const dateFmt = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug, { require: "members:read" });
  const canInvite = can(ctx.role, "members:invite");
  const supabase = await createClient();

  const [{ data: members }, invites] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, created_at").order("created_at"),
    canInvite
      ? supabase.from("invitations").select("id, email, role, expires_at").is("accepted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: "admin" | "staff" | "owner"; expires_at: string }[] }),
  ]);

  const pending = (invites.data ?? []).filter((i) => new Date(i.expires_at) > new Date());

  return (
    <>
      <PageHeader title="Equipo" description="Quién tiene acceso al panel y qué puede hacer." />

      {canInvite && (
        <div className="mb-8">
          <InviteForm />
        </div>
      )}

      <DataTable
        caption="Miembros del equipo"
        rows={members ?? []}
        rowKey={(m) => m.id}
        columns={[
          {
            key: "name",
            header: "Nombre",
            cell: (m) => (
              <span className="font-medium">
                {m.full_name ?? "Sin nombre"}
                {m.id === ctx.userId && <span className="ml-2 text-xs font-normal text-ink-3">(tú)</span>}
              </span>
            ),
          },
          { key: "since", header: "Desde", cell: (m) => dateFmt.format(new Date(m.created_at)), hideOnMobile: true },
          {
            key: "role",
            header: "Rol",
            align: "right",
            cell: (m) => <MemberControls memberId={m.id} memberRole={m.role} isSelf={m.id === ctx.userId} />,
          },
        ]}
        mobileRow={(m) => ({
          title: `${m.full_name ?? "Sin nombre"}${m.id === ctx.userId ? " (tú)" : ""}`,
          meta: ROLE_LABEL[m.role],
          aside: <MemberControls memberId={m.id} memberRole={m.role} isSelf={m.id === ctx.userId} />,
        })}
      />

      {pending.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-semibold">Invitaciones pendientes</h2>
          <DataTable
            caption="Invitaciones pendientes"
            rows={pending}
            rowKey={(i) => i.id}
            columns={[
              { key: "email", header: "Correo", cell: (i) => i.email },
              { key: "role", header: "Rol", cell: (i) => <Badge>{ROLE_LABEL[i.role]}</Badge> },
              { key: "exp", header: "Vence", cell: (i) => dateFmt.format(new Date(i.expires_at)), hideOnMobile: true },
              { key: "x", header: "", align: "right", cell: (i) => <RevokeInvitation id={i.id} /> },
            ]}
            mobileRow={(i) => ({ title: i.email, meta: ROLE_LABEL[i.role], aside: <RevokeInvitation id={i.id} /> })}
          />
        </section>
      )}
    </>
  );
}
