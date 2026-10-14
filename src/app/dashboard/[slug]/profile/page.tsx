import type { Metadata } from "next";
import { getTenantContext } from "@/lib/tenant";
import { ROLE_LABEL } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileNameForm, PasswordForm } from "./profile-forms";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);

  return (
    <>
      <PageHeader title="Mi perfil" description={`${ctx.email ?? ""} · ${ROLE_LABEL[ctx.role]}`} />
      <div className="grid gap-6">
        <ProfileNameForm initialName={ctx.fullName ?? ""} />
        <PasswordForm />
      </div>
    </>
  );
}
