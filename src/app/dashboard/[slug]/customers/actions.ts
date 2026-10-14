"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/tenant";

type CustomerField = "full_name" | "phone" | "email" | "document_id";

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Partial<Record<CustomerField, string>>;
  /** Lo que el usuario envió: React 19 reinicia el formulario tras la acción y así no se pierde. */
  values?: Partial<Record<CustomerField, string>>;
};

function submittedValues(formData: FormData): CustomerFormState["values"] {
  const get = (k: CustomerField) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  return { full_name: get("full_name"), phone: get("phone"), email: get("email"), document_id: get("document_id") };
}

const optional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), s.optional());

const schema = z.object({
  full_name: z.string().trim().min(1, "Escribe el nombre.").max(120),
  phone: optional(z.string().trim().regex(/^[0-9+\s-]{6,20}$/, "Teléfono no válido.")),
  email: optional(z.email("Correo no válido.")),
  document_id: optional(z.string().trim().regex(/^(\d{8}|\d{11})$/, "DNI (8 dígitos) o RUC (11 dígitos).")),
});

type ParseResult = { ok: true; data: z.infer<typeof schema> } | { ok: false; state: CustomerFormState };

function parseCustomer(formData: FormData): ParseResult {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (parsed.success) return { ok: true, data: parsed.data };
  const f = z.flattenError(parsed.error).fieldErrors;
  return {
    ok: false,
    state: {
      values: submittedValues(formData),
      fieldErrors: {
        full_name: f.full_name?.[0],
        phone: f.phone?.[0],
        email: f.email?.[0],
        document_id: f.document_id?.[0],
      },
    },
  };
}

export async function createCustomer(slug: string, _: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  await assertPermission(slug, "customers:write");

  const parsed = parseCustomer(formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  // organization_id lo pone la BD (DEFAULT private.current_org_id()) y RLS lo verifica.
  const { error } = await supabase.from("customers").insert(parsed.data);

  if (error) {
    const values = submittedValues(formData);
    if (error.code === "23505") return { values, fieldErrors: { document_id: "Ya hay un cliente con ese documento." } };
    return { values, error: "No se pudo guardar el cliente. Inténtalo de nuevo." };
  }

  revalidatePath(`/dashboard/${slug}`, "layout");
  redirect(`/dashboard/${slug}/customers`);
}

export async function updateCustomer(
  slug: string,
  id: string,
  _: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await assertPermission(slug, "customers:write");
  if (!z.uuid().safeParse(id).success) return { error: "Cliente no válido." };

  const parsed = parseCustomer(formData);
  if (!parsed.ok) return parsed.state;

  // Un campo vaciado llega como undefined y JSON lo omitiría: se envía null para borrarlo.
  const { full_name, phone, email, document_id } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ full_name, phone: phone ?? null, email: email ?? null, document_id: document_id ?? null })
    .eq("id", id)
    .select("id");

  if (error) {
    const values = submittedValues(formData);
    if (error.code === "23505") return { values, fieldErrors: { document_id: "Ya hay un cliente con ese documento." } };
    return { values, error: "No se pudo guardar el cliente. Inténtalo de nuevo." };
  }
  // RLS no lanza error si la fila no es visible: simplemente no actualiza nada.
  if (!data?.length) return { error: "Este cliente ya no existe." };

  revalidatePath(`/dashboard/${slug}`, "layout");
  redirect(`/dashboard/${slug}/customers`);
}

export async function deleteCustomer(slug: string, id: string): Promise<{ error?: string }> {
  await assertPermission(slug, "customers:delete");
  if (!z.uuid().safeParse(id).success) return { error: "Cliente no válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "Este cliente tiene ventas o abonos registrados y no se puede eliminar." };
    return { error: "No se pudo eliminar el cliente." };
  }
  revalidatePath(`/dashboard/${slug}`, "layout");
  return {};
}
