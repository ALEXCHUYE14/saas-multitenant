import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { hasAuthCookie } from "./auth-cookie";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];
// /reset-password exige la sesión que crea el enlace de recuperación.
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/reset-password", "/print", "/billing", "/admin"];

/**
 * Refresca la sesión de Supabase y aplica las reglas de acceso:
 *  - Sin sesión en /dashboard/* u /onboarding → /login?next=...
 *  - Con sesión en /login o /register        → /dashboard
 *
 * Ahorro de cuota (egress / logs de Supabase Auth): solo se consulta a Auth
 * cuando la ruta lo necesita Y existe una cookie de sesión. Rutas públicas y
 * visitantes sin cookie se resuelven sin ninguna llamada.
 *
 * La validación de pertenencia al tenant ([slug]) NO se hace aquí (evita una
 * consulta a la BD por request); la hace getTenantContext() en el layout
 * del dashboard, y RLS la garantiza a nivel de datos.
 */
export async function updateSession(request: NextRequest) {
  // Sin estas variables (p. ej. no cargadas en Vercel) todo el sitio daría un 500
  // genérico: se responde con un mensaje que dice exactamente qué falta.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[config] Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return new NextResponse(
      "Configuración incompleta: faltan las variables NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "En Vercel: Settings → Environment Variables, agrégalas y vuelve a desplegar (Redeploy).",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // Ruta pública (landing, webhooks, callback…): nada que validar ni refrescar aquí.
  if (!isProtected && !isAuthRoute) return NextResponse.next({ request });

  // Sin cookie de sesión no puede haber usuario: se decide sin llamar a Supabase.
  if (!hasAuthCookie(request.cookies.getAll())) {
    if (!isProtected) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // IMPORTANTE: no ejecutar código entre createServerClient y getClaims().
  // getClaims() valida la firma del JWT (no confíes en getSession() en servidor).
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  if (!isAuthenticated && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithCookies(url, response);
  }

  if (isAuthenticated && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  return response;
}

/** Mantiene las cookies de sesión refrescadas al redirigir. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
