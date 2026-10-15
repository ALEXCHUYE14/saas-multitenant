"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type ComponentProps } from "react";

/**
 * Link que precarga SOLO al mostrar intención (mouse encima, foco o inicio del
 * toque), no por estar visible. Para páginas dinámicas, router.prefetch() trae
 * el esqueleto (loading.tsx), no los datos: al hacer clic el cambio es inmediato
 * y los datos siempre llegan frescos (nada desactualizado tras una venta).
 * Una sola precarga por enlace y por montaje.
 */
export function IntentLink({ href, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const done = useRef(false);

  const warm = () => {
    if (done.current) return;
    done.current = true;
    router.prefetch(href);
  };

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
    />
  );
}
