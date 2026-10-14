/** Concatena clases condicionales (sin dependencias). */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
