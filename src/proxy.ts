/**
 * Next.js 16 renombró `middleware.ts` → `proxy.ts` (misma función, runtime Node).
 * Si usas Next.js 15: renombra este archivo a `src/middleware.ts` y la
 * función exportada a `middleware`. La lógica vive en lib/supabase/middleware.ts.
 */
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo excepto estáticos, archivos con extensión y /api (los webhooks no usan sesión de usuario).
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|js|css|map)$).*)",
  ],
};
