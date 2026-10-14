"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "./actions";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";

export function InvitationCard({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="rounded-panel border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">Tienes una invitación</h1>
      <p className="mt-1.5 text-sm text-ink-2">Únete al equipo para ver y gestionar los datos del negocio.</p>
      <div className="mt-6 grid gap-4">
        <FormAlert error={error} />
        <Button
          size="lg"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await acceptInvitation(token);
              if (res?.error) setError(res.error);
            })
          }
        >
          Unirme al equipo
        </Button>
      </div>
    </div>
  );
}
