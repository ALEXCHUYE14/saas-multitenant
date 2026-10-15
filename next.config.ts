import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Indicador "N" de desarrollo (solo en `npm run dev`): a la derecha para que
  // no tape el usuario del menú lateral, que está abajo a la izquierda.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // Comprobantes de pago de hasta 5 MB (por defecto las Server Actions aceptan 1 MB).
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
