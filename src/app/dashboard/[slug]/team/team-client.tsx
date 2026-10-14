"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { changeRole, inviteMember, removeMember, revokeInvitation, type InviteState } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { ROLE_LABEL } from "@/lib/permissions";
import type { OrgRole } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";

export function InviteForm() {
  const { organization, role } = useTenant();
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember.bind(null, organization.slug), {});
  const [copied, setCopied] = useState(false);

  return (
    <form action={action} className="rounded-panel border border-line bg-surface p-4 sm:p-6" noValidate>
      <h2 className="font-semibold">Invitar a alguien</h2>
      <p className="mt-1 text-sm text-ink-2">Recibirá un enlace para unirse. Vence en 7 días.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
        <Field label="Correo" name="email" type="email" inputMode="email" required />
        <div className="grid gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            Rol
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue="staff"
            className="h-11 rounded-control border border-line bg-surface-2 px-3 text-base outline-none focus:border-accent sm:text-sm"
          >
            <option value="staff">{ROLE_LABEL.staff}</option>
            {role === "owner" && <option value="admin">{ROLE_LABEL.admin}</option>}
          </select>
        </div>
        <Button type="submit" size="lg" loading={pending} className="sm:h-11">
          Crear invitación
        </Button>
      </div>
      <div className="mt-4 grid gap-2">
        <FormAlert error={state.error} />
        {state.link && (
          <div role="status" className="flex items-center gap-2 rounded-control bg-accent-soft p-2 pl-3 text-sm">
            <span className="min-w-0 flex-1 truncate">
              Enlace para {state.email}: <span className="text-ink-2">{state.link}</span>
            </span>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-surface px-3 text-xs font-medium"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

export function MemberControls({ memberId, memberRole, isSelf }: { memberId: string; memberRole: OrgRole; isSelf: boolean }) {
  const { organization, role, can } = useTenant();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const manageable = can("members:manage") && !(role === "admin" && memberRole === "owner");
  if (!manageable) return <span className="text-sm text-ink-2">{ROLE_LABEL[memberRole]}</span>;

  const roles: OrgRole[] = role === "owner" ? ["owner", "admin", "staff"] : ["admin", "staff"];

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      <select
        aria-label="Rol"
        value={memberRole}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            setError(undefined);
            const res = await changeRole(organization.slug, memberId, e.target.value as OrgRole);
            if (res.error) setError(res.error);
          })
        }
        className="h-8 rounded-control border border-line bg-surface-2 px-2 text-sm outline-none focus:border-accent"
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {!isSelf && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Quitar a esta persona del equipo? Perderá el acceso al panel.")) return;
            start(async () => {
              const res = await removeMember(organization.slug, memberId);
              if (res.error) setError(res.error);
            });
          }}
          className="h-8 rounded-control px-2 text-sm text-ink-3 hover:bg-danger/10 hover:text-danger"
        >
          Quitar
        </button>
      )}
    </div>
  );
}

export function RevokeInvitation({ id }: { id: string }) {
  const { organization } = useTenant();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => revokeInvitation(organization.slug, id))}
      className="h-8 rounded-control px-2 text-sm text-ink-3 hover:bg-surface-2 hover:text-ink"
    >
      Anular
    </button>
  );
}
