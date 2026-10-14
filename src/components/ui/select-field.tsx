"use client";

import { useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: { value: string; label: string }[];
  hint?: string;
  error?: string;
};

/** Select nativo con el mismo aspecto que <Field>. */
export function SelectField({ label, options, hint, error, className, id, ...props }: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const msgId = `${selectId}-msg`;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={cn(
          "relative flex h-11 items-center rounded-control border bg-surface-2 transition-colors focus-within:border-accent",
          error ? "border-danger" : "border-line",
        )}
      >
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? msgId : undefined}
          className="h-full w-full appearance-none bg-transparent pr-9 pl-3 text-base text-ink outline-none sm:text-sm"
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-surface text-ink">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 size-4 text-ink-3" aria-hidden />
      </div>
      {error ? (
        <p id={msgId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
