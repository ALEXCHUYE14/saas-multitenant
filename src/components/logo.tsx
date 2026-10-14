import { cn } from "@/lib/cn";

/** Marca genérica de la plataforma. Cámbiala por la tuya. */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 24 24" className="size-7 shrink-0" aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--accent)" />
        <path d="M7 8h10M7 12h6M7 16h8" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {!compact && <span>Panel</span>}
    </span>
  );
}
