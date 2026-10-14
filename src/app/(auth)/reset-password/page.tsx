import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Crea una nueva contraseña</h1>
      <p className="mt-1.5 text-sm text-ink-2">Al guardarla entrarás directo a tu panel.</p>
      <ResetPasswordForm />
    </>
  );
}
