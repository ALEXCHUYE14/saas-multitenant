"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createOrganization, type OnboardingState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { slugify, slugProblem } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";

type Availability = "idle" | "checking" | "available" | "taken";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createOrganization, {});
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");
  const reqId = useRef(0);

  const localProblem = slug ? slugProblem(slug) : null;

  // Comprobación en vivo con debounce (la validación final la hace la BD).
  useEffect(() => {
    if (!slug || localProblem) {
      setAvailability("idle");
      return;
    }
    const id = ++reqId.current;
    setAvailability("checking");
    const t = setTimeout(async () => {
      const { data, error } = await createClient().rpc("is_slug_available", { p_slug: slug });
      if (id !== reqId.current) return;
      setAvailability(error ? "idle" : data ? "available" : "taken");
    }, 350);
    return () => clearTimeout(t);
  }, [slug, localProblem]);

  const slugHint =
    availability === "checking"
      ? "Comprobando…"
      : availability === "available"
        ? "Disponible."
        : "Será la dirección de tu panel. Solo minúsculas, números y guiones.";

  const slugError =
    state.fieldErrors?.slug ??
    (slug && localProblem ? localProblem : undefined) ??
    (availability === "taken" ? "Esa dirección ya está en uso. Prueba otra." : undefined);

  return (
    <form action={action} className="mt-8 grid gap-5" noValidate>
      <FormAlert error={state.error} />
      <Field
        label="Nombre del negocio"
        name="name"
        required
        autoFocus
        placeholder="Ej. Óptica Luz"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!slugTouched) setSlug(slugify(e.target.value));
        }}
        error={state.fieldErrors?.name}
      />
      <Field
        label="Dirección del panel"
        name="slug"
        required
        prefix="/dashboard/"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={slug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
        }}
        hint={slugHint}
        error={slugError}
      />
      <Button
        type="submit"
        size="lg"
        loading={pending}
        disabled={!name.trim() || !slug || Boolean(localProblem) || availability === "taken"}
        className="mt-1 w-full"
      >
        Crear mi negocio
      </Button>
    </form>
  );
}
