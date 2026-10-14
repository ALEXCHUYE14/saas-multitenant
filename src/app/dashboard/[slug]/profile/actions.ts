"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/tenant";
import { passwordSchema } from "@/lib/password";

export type ProfileNameState = { error?: string; saved?: boolean };
export type PasswordState = {
  error?: string;
  saved?: boolean;
  fieldErrors?: Partial<Record<"current_password" | "password" | "password_confirm", string>>;
};

async function assertMember(slug: string) {
  const m = await getMembership();
  if (m.status !== "member" || m.ctx.organization.slug !== slug) throw new Error("No autorizado");
  return m.ctx;
}

export async function updateProfileName(slug: string, _: ProfileNameState, formData: FormData): Promise<ProfileNameState> {
  const ctx = await assertMember(slug);
  const parsed = z.string().trim().min(2, "Usa al menos 2 caracteres.").max(120).safeParse(formData.get("full_name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  // RLS + GRANT: solo se puede actualizar full_name del propio perfil.
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data }).eq("id", ctx.userId);
  if (error) return { error: "No se pudo guardar tu nombre." };

  revalidatePath(`/dashboard/${slug}`, "layout");
  return { saved: true };
}

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Escribe tu contraseña actual."),
    password: passwordSchema,
    password_confirm: z.string(),
  })
  .refine((d) => d.password === d.password_confirm, { message: "Las contraseñas no coinciden.", path: ["password_confirm"] })
  .refine((d) => d.password !== d.current_password, { message: "Usa una contraseña distinta a la actual.", path: ["password"] });

export async function changePassword(slug: string, _: PasswordState, formData: FormData): Promise<PasswordState> {
  const ctx = await assertMember(slug);
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return {
      fieldErrors: {
        current_password: f.current_password?.[0],
        password: f.password?.[0],
        password_confirm: f.password_confirm?.[0],
      },
    };
  }
  if (!ctx.email) return { error: "Tu cuenta no tiene correo asociado." };

  const supabase = await createClient();
  // Verifica la contraseña actual: evita que alguien la cambie desde una sesión abierta ajena.
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ctx.email,
    password: parsed.data.current_password,
  });
  if (authError) return { fieldErrors: { current_password: "La contraseña actual no es correcta." } };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password") return { fieldErrors: { password: "Esa contraseña es muy fácil de adivinar." } };
    if (error.code === "same_password") return { fieldErrors: { password: "Usa una contraseña distinta a la actual." } };
    return { error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
  }

  return { saved: true };
}
