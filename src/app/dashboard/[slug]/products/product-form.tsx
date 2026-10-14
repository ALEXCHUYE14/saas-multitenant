"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createProduct, updateProduct, type ProductFormState } from "./actions";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { FormAlert } from "@/components/ui/form-alert";
import { UNIT_LABEL, formatQty, unitDecimals } from "@/lib/format";
import type { Product, ProductUnit } from "@/lib/supabase/database.types";

const UNIT_OPTIONS = (Object.keys(UNIT_LABEL) as ProductUnit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }));

/** Sin `product` registra uno nuevo; con `product` edita ese registro. */
export function ProductForm({ product, categories }: { product?: Product; categories: string[] }) {
  const { organization, href } = useTenant();
  const [state, action, pending] = useActionState<ProductFormState, FormData>(
    product ? updateProduct.bind(null, organization.slug, product.id) : createProduct.bind(null, organization.slug),
    {},
  );

  // key: tras un error el formulario se monta de nuevo con lo que se envió.
  return <ProductFormFields key={JSON.stringify(state.values ?? null)} {...{ product, categories, state, action, pending, href }} />;
}

function ProductFormFields({
  product,
  categories,
  state,
  action,
  pending,
  href,
}: {
  product?: Product;
  categories: string[];
  state: ProductFormState;
  action: (formData: FormData) => void;
  pending: boolean;
  href: (path?: string) => string;
}) {
  const v = state.values;
  const [unit, setUnit] = useState<ProductUnit>((v?.unit as ProductUnit | undefined) ?? product?.unit ?? "unit");
  const [track, setTrack] = useState<boolean>(v ? v.track_stock === "on" : (product?.track_stock ?? true));
  const isService = unit === "service";
  const decimals = unitDecimals(unit);
  const qtyMode = decimals === 0 ? "numeric" : "decimal";
  const money = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2));

  return (
    <form action={action} className="mb-8 rounded-panel border border-line bg-surface p-4 sm:p-6" noValidate>
      <h2 className="font-semibold">{product ? "Editar producto" : "Nuevo producto"}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FormAlert error={state.error} />
        <Field
          label="Nombre"
          name="name"
          required
          autoFocus
          defaultValue={v?.name ?? product?.name ?? ""}
          error={state.fieldErrors?.name}
          className="sm:col-span-2"
        />
        <Field
          label="Categoría"
          name="category"
          list="product-categories"
          placeholder="Bebidas, Carnes, Lavados…"
          defaultValue={v?.category ?? product?.category ?? ""}
          error={state.fieldErrors?.category}
        />
        <datalist id="product-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field
          label="Código"
          name="code"
          hint="Opcional. SKU o código de barras."
          defaultValue={v?.code ?? product?.code ?? ""}
          error={state.fieldErrors?.code}
        />
        <SelectField
          label="Se vende por"
          name="unit"
          options={UNIT_OPTIONS}
          value={unit}
          onChange={(e) => setUnit(e.target.value as ProductUnit)}
          error={state.fieldErrors?.unit}
        />
        <Field
          label={isService ? "Precio del servicio" : `Precio por ${UNIT_LABEL[unit].toLowerCase()}`}
          name="price"
          prefix="S/"
          inputMode="decimal"
          required
          defaultValue={v?.price ?? money(product?.price)}
          error={state.fieldErrors?.price}
        />
        <Field
          label="Costo"
          name="cost"
          prefix="S/"
          inputMode="decimal"
          hint="Opcional. Lo que te cuesta a ti; sirve para ver tu ganancia."
          defaultValue={v?.cost ?? money(product?.cost)}
          error={state.fieldErrors?.cost}
        />
      </div>

      {!isService && (
        <fieldset className="mt-6 border-t border-line pt-5">
          <legend className="sr-only">Inventario</legend>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="track_stock"
              checked={track}
              onChange={(e) => setTrack(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Controlar stock de este producto
          </label>

          {track && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {product ? (
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">Stock actual</span>
                  <p className="flex h-11 items-center text-sm">
                    <span className="tabular font-medium">{formatQty(product.stock, product.unit)}</span>
                    {product.track_stock && (
                      <Link href={href(`/products/${product.id}`)} className="ml-3 text-ink-2 underline underline-offset-4 hover:text-ink">
                        Registrar movimiento
                      </Link>
                    )}
                  </p>
                </div>
              ) : (
                <Field
                  label="Stock inicial"
                  name="stock"
                  inputMode={qtyMode}
                  placeholder="0"
                  hint={decimals === 0 ? "Cantidad entera." : "Hasta 3 decimales (ej. 2.5)."}
                  defaultValue={v?.stock ?? ""}
                  error={state.fieldErrors?.stock}
                />
              )}
              <Field
                label="Avisarme cuando queden"
                name="min_stock"
                inputMode={qtyMode}
                hint="Opcional. Stock mínimo antes de reponer."
                defaultValue={v?.min_stock ?? (product?.min_stock ?? "").toString()}
                error={state.fieldErrors?.min_stock}
              />
            </div>
          )}
        </fieldset>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link
          href={href("/products")}
          className="inline-flex h-10 items-center justify-center rounded-control px-4 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          Cancelar
        </Link>
        <Button type="submit" loading={pending}>
          {product ? "Guardar cambios" : "Guardar producto"}
        </Button>
      </div>
    </form>
  );
}
