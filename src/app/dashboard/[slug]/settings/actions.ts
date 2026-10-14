"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";

export type OrgNameState = { error?: string; saved?: boolean };

export async function updateOrgName(slug: string, _: OrgNameState, formData: FormData): Promise<OrgNameState> {
  const ctx = await assertPermission(slug, "org:update");
  const parsed = z.string().trim().min(2, "Usa al menos 2 caracteres.").max(80).safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ name: parsed.data }).eq("id", ctx.organization.id);
  if (error) return { error: "No se pudo guardar el nombre." };

  revalidatePath(`/dashboard/${slug}`, "layout");
  return { saved: true };
}
