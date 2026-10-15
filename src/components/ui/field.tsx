"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  prefix?: string;
  /** Elemento al final del campo (p. ej. botón de mostrar contraseña). */
  suffix?: ReactNode;
};

/** Input con label, ayuda y error accesibles (aria-describedby). */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, prefix, suffix, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-11 items-center rounded-control border bg-surface-2 transition-colors",
          "focus-within:border-accent",
          error ? "border-danger" : "border-line",
        )}
      >
        {prefix && <span className="pl-3 text-sm text-ink-3 select-none">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hint ? hintId : null, error ? errorId : null) || undefined}
          className={cn(
            "h-full w-full min-w-0 bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-3 sm:text-sm",
            prefix && "pl-1",
          )}
          {...props}
        />
        {suffix && <span className="flex shrink-0 items-center pr-1">{suffix}</span>}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
