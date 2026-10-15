"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { GA_ID, trackPageView } from "@/lib/analytics";

// Evita contar dos veces la misma ruta seguida (React Strict Mode en desarrollo
// monta los efectos dos veces). A → B → A sí cuenta tres vistas.
let lastTracked: string | null = null;

/**
 * Carga gtag.js y registra una vista por cada cambio de ruta (también en la
 * navegación interna, sin recarga). Sin ID configurado no renderiza nada.
 * Solo depende de la ruta (no de ?query): cambiar un filtro no cuenta como vista.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === lastTracked) return;
    lastTracked = pathname;
    trackPageView(pathname);
  }, [pathname]);

  if (!GA_ID) return null;
  return (
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} strategy="afterInteractive" />
  );
}
