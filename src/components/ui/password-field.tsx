"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field, type FieldProps } from "./field";

/**
 * Campo de contraseña con botón para mostrar/ocultar.
 * - El valor no se pierde al alternar (mismo <input>, solo cambia `type`).
 * - Botón accesible: aria-label + aria-pressed; type="button" (no envía el formulario).
 * - Al enviar el formulario se vuelve a ocultar, para no dejarla visible en pantalla.
 */
export const PasswordField = forwardRef<HTMLInputElement, Omit<FieldProps, "type" | "suffix">>(function PasswordField(
  props,
  forwardedRef,
) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Une la ref interna con la que pase el padre (función u objeto).
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const hide = () => setVisible(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  return (
    <Field
      {...props}
      ref={setRef}
      type={visible ? "text" : "password"}
      // Visible como texto en el celular: sin mayúscula ni autocorrección automáticas.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      suffix={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="grid size-9 place-items-center rounded-control text-ink-3 transition-colors hover:text-ink focus-visible:text-ink"
        >
          {visible ? <EyeOff className="size-[1.125rem]" aria-hidden /> : <Eye className="size-[1.125rem]" aria-hidden />}
        </button>
      }
    />
  );
});
