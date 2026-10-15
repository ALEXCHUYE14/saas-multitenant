/**
 * ¿Hay una cookie de sesión de Supabase? (sb-<ref>-auth-token, o sus trozos .0, .1…)
 * Solo indica PRESENCIA, no validez: sirve para no consultar a Supabase Auth
 * cuando es seguro que no hay sesión (visitantes anónimos, bots). Nunca la uses
 * para autorizar: eso lo hacen getClaims() y RLS.
 */
export function hasAuthCookie(cookies: { name: string }[]): boolean {
  return cookies.some((c) => c.name.startsWith("sb-") && /-auth-token(\.\d+)?$/.test(c.name));
}
