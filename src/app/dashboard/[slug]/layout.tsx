import type { Metadata } from "next";
import { getTenantContext } from "@/lib/tenant";
import { TenantProvider } from "@/hooks/use-tenant";
import { AppShell } from "@/components/shell/app-shell";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { organization } = await getTenantContext(slug);
  return { title: { default: organization.name, template: `%s · ${organization.name}` } };
}

/**
 * Frontera del tenant: todo lo que cuelga de /dashboard/[slug] pasa por aquí.
 * getTenantContext valida sesión + pertenencia al slug (404 si es de otro tenant).
 */
export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);

  return (
    <TenantProvider
      value={{
        organization: ctx.organization,
        role: ctx.role,
        userId: ctx.userId,
        fullName: ctx.fullName,
        email: ctx.email,
      }}
    >
      <AppShell>{children}</AppShell>
    </TenantProvider>
  );
}
