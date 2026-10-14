/** Perú: UTC−5 todo el año (sin horario de verano). */
const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Inicio del día en Lima, desplazado `days` días, como instante UTC. */
export function limaStartOfDay(days = 0, now = new Date()): Date {
  const lima = new Date(now.getTime() + LIMA_OFFSET_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() + days) - LIMA_OFFSET_MS);
}

/** Inicio del mes en Lima, desplazado `months` meses, como instante UTC. */
export function limaStartOfMonth(months = 0, now = new Date()): Date {
  const lima = new Date(now.getTime() + LIMA_OFFSET_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth() + months, 1) - LIMA_OFFSET_MS);
}

/** "2026-10-14" → inicio de ese día en Lima (instante UTC). null si no es una fecha válida. */
export function parseLimaDate(value: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const utc = Date.UTC(y, mo, d);
  const check = new Date(utc);
  // Rechaza fechas imposibles (31 de febrero) que Date.UTC normalizaría.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo || check.getUTCDate() !== d) return null;
  return new Date(utc - LIMA_OFFSET_MS);
}

/** Instante → "YYYY-MM-DD" del día correspondiente en Lima. */
export function toLimaDateString(date: Date): string {
  return new Date(date.getTime() + LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

export const RANGE_PRESETS = {
  today: "Hoy",
  yesterday: "Ayer",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  month: "Este mes",
  lastmonth: "Mes pasado",
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export type DateRange = {
  preset: RangePreset | "custom";
  from: Date; // inclusivo
  to: Date; // exclusivo
  /** Fechas visibles (inclusive) para el formulario. */
  fromDate: string;
  toDate: string;
  error?: string;
};

const MAX_RANGE_DAYS = 366;

/** Resuelve ?range= o ?from=&to= (fechas inclusive, hora de Lima). Por defecto: últimos 7 días. */
export function resolveRange(params: { range?: string; from?: string; to?: string }, now = new Date()): DateRange {
  const build = (preset: DateRange["preset"], from: Date, to: Date, error?: string): DateRange => ({
    preset,
    from,
    to,
    fromDate: toLimaDateString(from),
    toDate: toLimaDateString(new Date(to.getTime() - 1)),
    error,
  });

  const presets: Record<RangePreset, () => DateRange> = {
    today: () => build("today", limaStartOfDay(0, now), limaStartOfDay(1, now)),
    yesterday: () => build("yesterday", limaStartOfDay(-1, now), limaStartOfDay(0, now)),
    "7d": () => build("7d", limaStartOfDay(-6, now), limaStartOfDay(1, now)),
    "30d": () => build("30d", limaStartOfDay(-29, now), limaStartOfDay(1, now)),
    month: () => build("month", limaStartOfMonth(0, now), limaStartOfDay(1, now)),
    lastmonth: () => build("lastmonth", limaStartOfMonth(-1, now), limaStartOfMonth(0, now)),
  };

  if (params.from || params.to) {
    const from = parseLimaDate(params.from);
    const toStart = parseLimaDate(params.to);
    if (!from || !toStart) return { ...presets["7d"](), error: "Fecha no válida. Usa el selector de fechas." };
    if (from > toStart) return { ...presets["7d"](), error: "La fecha inicial es posterior a la final." };
    const to = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS)
      return { ...presets["7d"](), error: "El rango máximo es de un año." };
    return build("custom", from, to);
  }

  const key = params.range && params.range in RANGE_PRESETS ? (params.range as RangePreset) : "7d";
  return presets[key]();
}
