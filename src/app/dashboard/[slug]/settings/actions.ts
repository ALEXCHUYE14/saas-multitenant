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

export type TicketSettingsState = {
  error?: string;
  saved?: boolean;
  fieldErrors?: Partial<Record<"tax_id" | "address" | "phone" | "ticket_footer", string>>;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usa como máximo ${max} caracteres.`)
    .transform((v) => v || null);

const ticketSchema = z.object({
  tax_id: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9]{11}$/.test(v), "El RUC tiene 11 dígitos.")
    .transform((v) => v || null),
  address: optionalText(160),
  phone: optionalText(30),
  ticket_footer: optionalText(200),
});

export async function updateTicketSettings(
  slug: string,
  _: TicketSettingsState,
  formData: FormData,
): Promise<TicketSettingsState> {
  const ctx = await assertPermission(slug, "org:update");
  const parsed = ticketSchema.safeParse({
    tax_id: formData.get("tax_id") ?? "",
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    ticket_footer: formData.get("ticket_footer") ?? "",
  });
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return {
      fieldErrors: {
        tax_id: f.tax_id?.[0],
        address: f.address?.[0],
        phone: f.phone?.[0],
        ticket_footer: f.ticket_footer?.[0],
      },
    };
  }

  const supabase = await createClient();
  // Campos vaciados se guardan como null (no se omiten).
  const { data, error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", ctx.organization.id)
    .select("id");
  if (error || !data?.length) return { error: "No se pudieron guardar los datos del ticket." };

  revalidatePath(`/dashboard/${slug}`, "layout");
  return { saved: true };
}
