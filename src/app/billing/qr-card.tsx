import Image, { type StaticImageData } from "next/image";
import { Download } from "lucide-react";
import { BILLING } from "@/lib/billing";

/**
 * QR de cobro (Yape / Plin). En el celular no se puede escanear la propia
 * pantalla: "Guardar QR" descarga la imagen para subirla desde la galería en la app.
 */
export function QrCard({
  app,
  image,
  number,
  fileName,
}: {
  app: "Yape" | "Plin";
  image: StaticImageData;
  number: string | null;
  fileName: string;
}) {
  return (
    <figure className="flex flex-col items-center gap-3 rounded-panel border border-line bg-surface-2 p-4 text-center">
      <figcaption className="font-semibold">
        Paga con {app}
        <span className="block text-sm font-normal text-ink-2">
          Monto: <span className="font-semibold text-ink tabular">{BILLING.priceLabel}</span>
        </span>
      </figcaption>
      {/* Fondo blanco fijo: el QR debe leerse también en modo oscuro. */}
      <div className="w-full max-w-[14rem] rounded-control bg-white p-2">
        <Image
          src={image}
          alt={`Código QR de ${app} para pagar la suscripción`}
          className="h-auto w-full"
          sizes="14rem"
          placeholder="empty"
        />
      </div>
      {number && (
        <p className="text-sm text-ink-2">
          o al celular <span className="font-medium text-ink tabular">{number}</span>
        </p>
      )}
      <a
        href={image.src}
        download={fileName}
        className="inline-flex h-10 items-center gap-2 rounded-control border border-line px-4 text-sm text-ink-2 hover:text-ink"
      >
        <Download className="size-4" />
        Guardar QR
      </a>
    </figure>
  );
}
