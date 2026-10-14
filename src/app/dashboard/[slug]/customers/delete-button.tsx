"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCustomer } from "./actions";

export function DeleteCustomerButton({ slug, id, name }: { slug: string; id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Eliminar a ${name}? Esta acción no se puede deshacer.`)) return;
        start(async () => {
          const res = await deleteCustomer(slug, id);
          if (res.error) alert(res.error);
        });
      }}
      className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-danger/10 hover:text-danger disabled:opacity-40"
      aria-label={`Eliminar a ${name}`}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
