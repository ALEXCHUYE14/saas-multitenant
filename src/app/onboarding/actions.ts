"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { slugProblem } from "@/lib/slug";

export type OnboardingState = {
  error?: string;
  fieldErrors?: { name?: string; slug?: string };
  values?: { name: string; slug: string };
};

const schema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de tu negocio.").max(80, "Máximo 80 caracteres."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((s, ctx) => {
      const problem = slugProblem(s);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
});

export async function createOrganization(_: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const values = { name: String(formData.get("name") ?? ""), slug: String(formData.get("slug") ?? "") };
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return { values, fieldErrors: { name: f.name?.[0], slug: f.slug?.[0] } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });

  if (error) {
    switch (error.message) {
      case "slug_taken":
        return { values, fieldErrors: { slug: "Esa dirección ya está en uso. Prueba otra." } };
      case "already_member":
        redirect("/dashboard");
      case "invalid_input":
        return { values, error: "Revisa el nombre y la dirección." };
      default:
        return { values, error: "No pudimos crear el negocio. Inténtalo de nuevo." };
    }
  }

  redirect(`/dashboard/${data.slug}`);
}

export async function acceptInvitation(token: string): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(token).success) return { error: "La invitación no es válida." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });

  if (error) {
    if (error.message === "already_member") redirect("/dashboard");
    return { error: "La invitación venció, ya se usó o es para otro correo." };
  }
  redirect(`/dashboard/${data.slug}`);
}
