"use client";

import { useTransition } from "react";
import { extendTrial, reviewPayment, setOrgStatus } from "./actions";
import { Button } from "@/components/ui/button";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) alert(res.error);
    });
  return { pending, run };
}

export function ReviewButtons({ paymentId, label }: { paymentId: string; label: string }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        loading={pending}
        onClick={() => {
          if (confirm(`¿Confirmas que recibiste el pago de ${label}? Se activará su acceso.`)) run(() => reviewPayment(paymentId, true));
        }}
      >
        Aprobar
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => {
          const reason = prompt("Motivo del rechazo (lo verá el cliente):");
          if (reason !== null) run(() => reviewPayment(paymentId, false, reason));
        }}
      >
        Rechazar
      </Button>
    </div>
  );
}

export function OrgActions({ orgId, name, suspended }: { orgId: string; name: string; suspended: boolean }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const raw = prompt(`¿Cuántos días de prueba regalas a ${name}? (1 a 90)`, "7");
          if (raw === null) return;
          const days = Number.parseInt(raw, 10);
          run(() => extendTrial(orgId, days));
        }}
        className="text-ink-2 underline underline-offset-4 hover:text-ink disabled:opacity-50"
      >
        + Días
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const msg = suspended ? `¿Reactivar ${name}?` : `¿Suspender ${name}? Su equipo perderá el acceso de inmediato.`;
          if (confirm(msg)) run(() => setOrgStatus(orgId, suspended ? "active" : "suspended"));
        }}
        className={`underline underline-offset-4 disabled:opacity-50 ${suspended ? "text-ok" : "text-danger"}`}
      >
        {suspended ? "Reactivar" : "Suspender"}
      </button>
    </div>
  );
}
