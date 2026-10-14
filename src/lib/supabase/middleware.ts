import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

const AUTH_ROUTES = ["/login", "/register"];
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

/**
 * Refresca la sesión de Supabase en cada request y aplica las reglas de acceso:
 *  - Sin sesión en /dashboard/* u /onboarding → /login?next=...
 *  - Con sesión en /login o /register        → /dashboard
 *
 * La validación de pertenencia al tenant ([slug]) NO se hace aquí (evita una
 * consulta a la BD por request); la hace getTenantContext() en el layout
 * del dashboard, y RLS la garantiza a nivel de datos.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

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
