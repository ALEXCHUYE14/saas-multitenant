/**
 * Google Analytics 4 (gtag.js) con privacidad por defecto.
 *
 * Nunca se envía la URL real: puede contener tokens de invitación (?invite=),
 * búsquedas con nombres de clientes (?q=), el slug del negocio o ids. Se envía
 * una ruta normalizada por sección: /dashboard/:negocio/sales/:id
 *
 * Sin NEXT_PUBLIC_GA_MEASUREMENT_ID válido (G-XXXXXXX) no se carga nada.
 */
const RAW_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
export const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(RAW_ID) ? RAW_ID : null;

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Rutas cuyo 2.º segmento es el slug del negocio.
const TENANT_PREFIXES = new Set(["dashboard", "print"]);

/** "/dashboard/mafc/sales/<uuid>?q=x" → "/dashboard/:negocio/sales/:id" (sin query ni hash). */
export function sanitizePath(pathname: string): string {
  const clean = (pathname.split(/[?#]/)[0] ?? "/").replace(/\/+$/, "") || "/";
  const parts = clean.split("/");
  const out = parts.map((seg, i) => {
    if (i === 2 && TENANT_PREFIXES.has(parts[1] ?? "")) return ":negocio";
    if (UUID.test(seg)) return ":id";
    if (/^\d{3,}$/.test(seg)) return ":n"; // números largos (por si acaso)
    return seg;
  });
  return out.join("/") || "/";
}

/**
 * Crea la cola de gtag (aunque gtag.js aún no haya cargado: los comandos se
 * guardan en dataLayer y se procesan al cargar) y la configura UNA vez, antes
 * de cualquier evento. send_page_view:false → las vistas las envía trackPageView.
 */
function gtag(): Gtag | null {
  if (!GA_ID || typeof window === "undefined") return null;
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // gtag.js exige el objeto `arguments`, no un array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: false });
  }
  return window.gtag;
}

/** Vista de página con ruta y título normalizados (sin datos sensibles). */
export function trackPageView(pathname: string): void {
  const g = gtag();
  if (!g) return;
  const path = sanitizePath(pathname);
  const location = window.location.origin + path;
  const isPrivate = path.startsWith("/dashboard/") || path.startsWith("/print/") || path.startsWith("/admin");
  // En el panel el título lleva el nombre del negocio: se usa la ruta normalizada.
  const title = isPrivate ? path : document.title;
  // `set`: también los eventos automáticos (scroll, clics…) usan la URL limpia.
  g("set", { page_location: location, page_path: path, page_title: title });
  g("event", "page_view", { page_location: location, page_path: path, page_title: title });
}

/** Evento personalizado. No envíes aquí datos personales (nombres, correos, teléfonos). */
export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  gtag()?.("event", name, params ?? {});
}
