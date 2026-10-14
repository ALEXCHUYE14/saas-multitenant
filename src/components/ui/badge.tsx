import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok/12 text-ok",
  warn: "bg-warn/12 text-warn",
  danger: "bg-danger/12 text-danger",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
