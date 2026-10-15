import { redirect } from "next/navigation";

// Ruta antigua: el estado de la cuenta (vencida o suspendida) ahora vive en /billing.
export default function SuspendedPage() {
  redirect("/billing");
}
