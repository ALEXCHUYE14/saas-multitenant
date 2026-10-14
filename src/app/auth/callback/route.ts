import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino del enlace de confirmación / magic link / OAuth.
 * Soporta los dos formatos de Supabase: ?code= (PKCE) y ?token_hash=&type=.
 * En la plantilla de email de Supabase usa:
 *   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/dashboard
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing params") };

  if (error) return NextResponse.redirect(`${origin}/login?error=link`);
  return NextResponse.redirect(`${origin}${next}`);
}
