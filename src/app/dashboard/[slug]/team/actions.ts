"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";
import type { OrgRole } from "@/lib/supabase/database.types";

export type InviteState = { error?: string; link?: string; email?: string };

const inviteSchema = z.object({
  email: z.email("Escribe un correo válido.").transform((e) => e.toLowerCase()),
  role: z.enum(["admin", "staff"]),
});

export async function inviteMember(slug: string, _: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await assertPermission(slug, "members:invite");
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Un admin no puede invitar admins (solo el owner).
  if (parsed.data.role === "admin" && ctx.role !== "owner")
    return { error: "Solo el propietario puede invitar administradores." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({ organization_id: ctx.organization.id, email: parsed.data.email, role: parsed.data.role, invited_by: ctx.userId })
    .select("token")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Ya hay una invitación pendiente para ese correo." };
    return { error: "No se pudo crear la invitación." };
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin") ?? "";
  revalidatePath(`/dashboard/${slug}/team`);
  // Envía este enlace por correo (Resend, Supabase Edge Function…) o compártelo por WhatsApp.
  // Si la persona aún no tiene cuenta, al registrarse con ese correo entra directo al equipo.
  return { link: `${origin}/onboarding?invite=${data.token}`, email: parsed.data.email };
}

export async function revokeInvitation(slug: string, id: string) {
  await assertPermission(slug, "members:invite");
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id);
  revalidatePath(`/dashboard/${slug}/team`);
}

export async function changeRole(slug: string, memberId: string, role: OrgRole): Promise<{ error?: string }> {
  await assertPermission(slug, "members:manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", { p_member_id: memberId, p_role: role });
  if (error) {
    if (error.message === "last_owner") return { error: "El negocio necesita al menos un propietario." };
    if (error.message === "forbidden") return { error: "No tienes permiso para ese cambio." };
    return { error: "No se pudo cambiar el rol." };
  }
  revalidatePath(`/dashboard/${slug}/team`);
  return {};
}

export async function removeMember(slug: string, memberId: string): Promise<{ error?: string }> {
  await assertPermission(slug, "members:manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_member_id: memberId });
  if (error) {
    if (error.message === "last_owner") return { error: "No puedes quitar al único propietario." };
    return { error: "No se pudo quitar a esta persona." };
  }
  revalidatePath(`/dashboard/${slug}/team`);
  return {};
}
