"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { slugify, slugProblem } from "@/lib/slug";
import { passwordSchema } from "@/lib/password";

export type AuthState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "password_confirm" | "full_name" | "business", string>>;
  notice?: string;
  values?: Record<string, string>;
};

/** Solo rutas internas: evita open-redirects vía ?next= */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

const loginSchema = z.object({
  email: z.email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return { values, fieldErrors: { email: f.email?.[0], password: f.password?.[0] } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed")
      return { values, error: "Confirma tu correo antes de entrar. Revisa tu bandeja de entrada." };
    return { values, error: "Correo o contraseña incorrectos." };
  }

  redirect(safeNext(formData.get("next")));
}

async function siteOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin") ?? "";
}

const registerSchema = z.object({
  full_name: z.string().trim().min(2, "Escribe tu nombre.").max(120),
  email: z.email("Escribe un correo válido."),
  password: passwordSchema,
  business: z.string().trim().max(80).optional(),
});

export async function register(_: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { full_name: raw.full_name ?? "", email: raw.email ?? "", business: raw.business ?? "" };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return {
      values,
      fieldErrors: {
        full_name: f.full_name?.[0],
        email: f.email?.[0],
        password: f.password?.[0],
        business: f.business?.[0],
      },
    };
  }

  const { full_name, email, password, business } = parsed.data;

  // Si indicó negocio, handle_new_user() intentará crearlo. Si el slug está
  // ocupado, el usuario lo resolverá en /onboarding.
  const orgSlug = business ? slugify(business) : "";
  const orgMeta =
    business && business.length >= 2 && !slugProblem(orgSlug) ? { org_name: business, org_slug: orgSlug } : {};

  const origin = await siteOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, ...orgMeta },
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists")
      return { values, fieldErrors: { email: "Ya existe una cuenta con este correo. Inicia sesión." } };
    if (error.code === "weak_password") return { values, fieldErrors: { password: error.message } };
    return { values, error: "No pudimos crear tu cuenta. Inténtalo de nuevo en unos minutos." };
  }

  // Confirmación de email activada → aún no hay sesión.
  if (!data.session) {
    return { notice: `Te enviamos un enlace a ${email}. Ábrelo para activar tu cuenta.` };
  }

  redirect("/dashboard");
}

const forgotSchema = z.object({ email: z.email("Escribe un correo válido.") });

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { values, fieldErrors: { email: parsed.error.issues[0]?.message } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });

  if (error?.code === "over_email_send_rate_limit" || error?.status === 429)
    return { values, error: "Ya pediste varios enlaces. Espera unos minutos e inténtalo otra vez." };

  // Mismo mensaje exista o no la cuenta: no revela qué correos están registrados.
  return {
    notice: `Si ${parsed.data.email} tiene una cuenta, te llegará un enlace para crear una nueva contraseña. Ábrelo en este mismo navegador.`,
  };
}

const resetSchema = z
  .object({ password: passwordSchema, password_confirm: z.string() })
  .refine((d) => d.password === d.password_confirm, {
    message: "Las contraseñas no coinciden.",
    path: ["password_confirm"],
  });

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return { fieldErrors: { password: f.password?.[0], password_confirm: f.password_confirm?.[0] } };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Tu enlace venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?»." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Usa una contraseña distinta a la anterior." } };
    if (error.code === "weak_password") return { fieldErrors: { password: "Esa contraseña es muy fácil de adivinar." } };
    return { error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
