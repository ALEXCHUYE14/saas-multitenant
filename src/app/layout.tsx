import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GoogleAnalytics } from "@/components/google-analytics";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel" },
  description: "Gestión de operaciones para tu negocio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121820" },
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
  ],
};

// Aplica el tema antes del primer pintado (evita el destello claro).
// Oscuro por defecto; "system" sigue al sistema operativo.
const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'dark';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
