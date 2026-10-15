"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import {
  cancelCardSubscription,
  reportManualPayment,
  startCardSubscription,
  type CardState,
  type ReportState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { FormAlert } from "@/components/ui/form-alert";
import { BILLING } from "@/lib/billing";

/** Dato con botón de copiar (número de cuenta, CCI, celular). */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-control bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-ink-3">{label}</p>
        <p className="font-medium tabular [overflow-wrap:anywhere]">{value}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Sin permiso de portapapeles: el dato sigue visible para copiar a mano.
          }
        }}
        className="grid size-10 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-surface hover:text-ink"
        aria-label={`Copiar ${label}`}
      >
        {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

export function CardSubscribeForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState<CardState, FormData>(startCardSubscription, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormAlert error={state.error} />
      <Field
        label="Correo de tu cuenta de Mercado Pago"
        name="payer_email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        defaultValue={state.email ?? defaultEmail}
        hint="Te llevaremos a Mercado Pago para registrar tu tarjeta de forma segura."
      />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Suscribirme con tarjeta · {BILLING.priceLabel}/mes
      </Button>
    </form>
  );
}

export function CancelCardButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-2">
      <FormAlert error={error} />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Cancelar el cobro automático? Conservas el acceso hasta el fin del periodo ya pagado.")) return;
          start(async () => {
            const res = await cancelCardSubscription();
            setError(res.error);
          });
        }}
        className="justify-self-start text-sm text-danger hover:underline disabled:opacity-50"
      >
        Cancelar cobro automático
      </button>
    </div>
  );
}

export function ReportPaymentForm({ methods, today }: { methods: { value: string; label: string }[]; today: string }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(reportManualPayment, {});
  const v = state.values;

  if (state.saved) {
    return (
      <FormAlert notice="¡Gracias! Registramos tu pago. Ya tienes acceso mientras lo confirmamos (normalmente el mismo día)." />
    );
  }

  return (
    <form key={JSON.stringify(v ?? null)} action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <FormAlert error={state.error} />
      <SelectField
        label="¿Cómo pagaste?"
        name="method"
        options={methods}
        defaultValue={v?.method ?? methods[0]?.value}
        error={state.fieldErrors?.method}
      />
      <Field
        label="N.º de operación"
        name="operation"
        required
        autoCapitalize="characters"
        placeholder="Ej.: 01234567"
        defaultValue={v?.operation}
        error={state.fieldErrors?.operation}
      />
      <Field
        label="Fecha del pago"
        name="paid_on"
        type="date"
        required
        max={today}
        defaultValue={v?.paid_on ?? today}
        error={state.fieldErrors?.paid_on}
      />
      <Field
        label="Monto pagado"
        name="amount"
        prefix="S/"
        inputMode="decimal"
        required
        defaultValue={v?.amount ?? BILLING.priceSoles.toFixed(2)}
        hint="S/ 70 = 2 meses, S/ 105 = 3 meses…"
        error={state.fieldErrors?.amount}
      />
      <div className="grid gap-1.5 sm:col-span-2">
        <label htmlFor="receipt" className="text-sm font-medium">
          Foto o PDF del comprobante <span className="font-normal text-ink-3">(recomendado)</span>
        </label>
        <input
          id="receipt"
          name="receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="block w-full rounded-control border border-line bg-surface-2 text-base text-ink-2 file:mr-3 file:h-11 file:border-0 file:bg-surface file:px-4 file:text-ink sm:text-sm"
          aria-describedby="receipt-msg"
        />
        <p id="receipt-msg" className={state.fieldErrors?.receipt ? "text-xs text-danger" : "text-xs text-ink-3"}>
          {state.fieldErrors?.receipt ?? "Máximo 5 MB. Acelera la confirmación."}
        </p>
      </div>
      <Button type="submit" size="lg" loading={pending} className="w-full sm:col-span-2">
        Reportar pago
      </Button>
    </form>
  );
}
