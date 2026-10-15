import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getMembership } from "@/lib/tenant";
import { logout } from "@/app/(auth)/actions";
import { OnboardingForm } from "./onboarding-form";
import { InvitationCard } from "./invitation-card";

export const metadata: Metadata = { title: "Configura tu negocio" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const membership = await getMembership();
  if (membership.status === "unauthenticated") redirect("/login?next=/onboarding");
  if (membership.status === "member") redirect(`/dashboard/${membership.ctx.organization.slug}`);
  if (membership.status === "inactive") redirect("/billing");

  const { invite } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Logo />
        <form action={logout}>
          <button className="text-sm text-ink-2 hover:text-ink">Cerrar sesión</button>
        </form>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        {invite ? (
          <InvitationCard token={invite} />
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Configura tu negocio</h1>
            <p className="mt-1.5 text-sm text-ink-2">
              Elige el nombre que verá tu equipo y la dirección de tu panel. Podrás cambiar el nombre después.
            </p>
            <OnboardingForm />
            <p className="mt-8 text-sm text-ink-3">
              ¿Te invitaron a un negocio existente? Abre el enlace de invitación que te enviaron.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
