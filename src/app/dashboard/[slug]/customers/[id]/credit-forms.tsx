"use client";

import { useActionState, useTransition } from "react";
import { Ban } from "lucide-react";
import { registerPayment, voidPayment, type PaymentFormState } from "../credit-actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { FormAlert } from "@/components/ui/form-alert";
import { MONEY_METHODS, PAYMENT_LABEL, formatMoney } from "@/lib/format";

const METHOD_OPTIONS = MONEY_METHODS.map((m) => ({ value: m, label: PAYMENT_LABEL[m] }));

export function PaymentForm({ customerId, debt }: { customerId: string; debt: number }) {
  const { organization } = useTenant();
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(
    registerPayment.bind(null, organization.slug, customerId),
    {},
  );

  return (
    <form
      key={JSON.stringify(state.values ?? null) + String(state.saved ?? "")}
      action={action}
      className="rounded-panel border border-line bg-surface p-4 sm:p-6"
      noValidate
    >
      <h2 className="font-semibold">Registrar abono</h2>
      <p className="mt-1 text-sm text-ink-2">
        Debe <span className="tabular font-medium text-ink">{formatMoney(debt)}</span>
      </p>
      <div className="mt-5 grid gap-4">
        <FormAlert error={state.error} notice={state.saved ? "Abono registrado." : undefined} />
        <Field
          label="Monto"
          name="amount"
          prefix="S/"
          inputMode="decimal"
          required
          placeholder={debt.toFixed(2)}
          defaultValue={state.values?.amount}
          error={state.fieldErrors?.amount}
        />
        <SelectField
          label="Pagó con"
          name="method"
          options={METHOD_OPTIONS}
          defaultValue={state.values?.method ?? "cash"}
          error={state.fieldErrors?.method}
        />
        <Field label="Nota" name="note" maxLength={200} placeholder="Opcional" defaultValue={state.values?.note} error={state.fieldErrors?.note} />
      </div>
      <Button type="submit" loading={pending} className="mt-6 w-full">
        Registrar abono
      </Button>
    </form>
  );
}

export function VoidPaymentButton({ paymentId, amount }: { paymentId: string; amount: number }) {
  const { organization } = useTenant();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const reason = prompt(`Motivo para anular el abono de ${formatMoney(amount)}:`);
        if (reason === null) return;
        start(async () => {
          const res = await voidPayment(organization.slug, paymentId, reason);
          if (res.error) alert(res.error);
        });
      }}
      className="grid size-10 place-items-center sm:size-8 rounded-control text-ink-3 hover:bg-danger/10 hover:text-danger disabled:opacity-40"
      aria-label="Anular abono"
      title="Anular abono"
    >
      <Ban className="size-4" />
    </button>
  );
}
