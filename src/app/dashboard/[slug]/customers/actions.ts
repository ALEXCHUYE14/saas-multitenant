"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"full_name" | "phone" | "email" | "document_id", string>>;
};

const optional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), s.optional());

const schema = z.object({
  full_name: z.string().trim().min(1, "Escribe el nombre.").max(120),
  phone: optional(z.string().trim().regex(/^[0-9+\s-]{6,20}$/, "Teléfono no válido.")),
  email: optional(z.email("Correo no válido.")),
  document_id: optional(z.string().trim().regex(/^(\d{8}|\d{11})$/, "DNI (8 dígitos) o RUC (11 dígitos).")),
});

export async function createCustomer(slug: string, _: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  await assertPermission(slug, "customers:write");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return {
      fieldErrors: {
        full_name: f.full_name?.[0],
        phone: f.phone?.[0],
        email: f.email?.[0],
        document_id: f.document_id?.[0],
      },
    };
  }

  const supabase = await createClient();
  // organization_id lo pone la BD (DEFAULT private.current_org_id()) y RLS lo verifica.
  const { error } = await supabase.from("customers").insert(parsed.data);

  if (error) {
    if (error.code === "23505") return { fieldErrors: { document_id: "Ya hay un cliente con ese documento." } };
    return { error: "No se pudo guardar el cliente. Inténtalo de nuevo." };
  }

  revalidatePath(`/dashboard/${slug}`, "layout");
  redirect(`/dashboard/${slug}/customers`);
}

export async function deleteCustomer(slug: string, id: string) {
  await assertPermission(slug, "customers:delete");
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar el cliente.");
  revalidatePath(`/dashboard/${slug}`, "layout");
}
