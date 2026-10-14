"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "dark" | "light" | "system";
const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "dark", label: "Oscuro", Icon: Moon },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "system", label: "Sistema", Icon: Monitor },
];

function apply(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Control segmentado de tema. Persiste en localStorage; oscuro por defecto. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      setTheme((localStorage.getItem("theme") as Theme | null) ?? "dark");
    } catch {}
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (t: Theme) => {
    setTheme(t);
    apply(t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  };

  if (compact) {
    const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    const current = OPTIONS.find((o) => o.value === theme)!;
    return (
      <button
        type="button"
        onClick={() => choose(next)}
        className="grid size-9 place-items-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
        aria-label={`Tema: ${current.label}. Cambiar`}
        title={`Tema: ${current.label}`}
      >
        <current.Icon className="size-4" />
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 rounded-control bg-surface-2 p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          title={label}
          className={cn(
            "flex h-7 items-center justify-center rounded-[0.375rem] text-ink-3 transition-colors hover:text-ink",
            theme === value && "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]",
          )}
        >
          <Icon className="size-3.5" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
