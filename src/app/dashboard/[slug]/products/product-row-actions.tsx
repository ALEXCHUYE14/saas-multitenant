"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { deleteProduct, setProductActive } from "./actions";

const btn =
  "grid size-8 place-items-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40";

export function ProductRowActions({ slug, id, name, active }: { slug: string; id: string; name: string; active: boolean }) {
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) alert(res.error);
    });

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setProductActive(slug, id, !active))}
        className={btn}
        aria-label={active ? `Archivar ${name}` : `Reactivar ${name}`}
        title={active ? "Archivar (deja de aparecer para vender)" : "Reactivar"}
      >
        {active ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(`¿Eliminar ${name}? Se borrará también su historial de stock. Esta acción no se puede deshacer.`))
            run(() => deleteProduct(slug, id));
        }}
        className={`${btn} hover:bg-danger/10 hover:text-danger`}
        aria-label={`Eliminar ${name}`}
      >
        <Trash2 className="size-4" />
      </button>
    </>
  );
}
