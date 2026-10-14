export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "billing", "dashboard", "docs", "help", "login",
  "logout", "new", "onboarding", "register", "settings", "signup", "static",
  "status", "support", "www", "mail", "root", "system",
]);

/** "Óptica Luz & Visión" → "optica-luz-vision" */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return "Usa al menos 3 caracteres.";
  if (!SLUG_REGEX.test(slug) || slug.includes("--"))
    return "Solo minúsculas, números y guiones; sin guion al inicio o al final.";
  if (RESERVED_SLUGS.has(slug)) return "Esa dirección está reservada. Prueba otra.";
  return null;
}
