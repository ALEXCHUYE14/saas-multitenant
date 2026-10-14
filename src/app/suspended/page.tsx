import { Logo } from "@/components/logo";
import { logout } from "@/app/(auth)/actions";

export const metadata = { title: "Cuenta suspendida" };

export default function SuspendedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Este negocio está suspendido</h1>
      <p className="mt-2 text-sm text-ink-2">
        Los datos se conservan, pero el acceso está pausado. El propietario puede reactivarlo regularizando el plan o
        escribiendo a soporte.
      </p>
      <form action={logout} className="mt-8">
        <button className="text-sm font-medium text-ink underline decoration-accent decoration-2 underline-offset-4">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
