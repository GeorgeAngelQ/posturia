import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/presentation/components/AppShell";
import {
  OrganizationProvider,
  useOrganization,
} from "@/presentation/organization/organization-context";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useI18n } from "@/presentation/i18n/i18n";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <OrganizationProvider userId={user.id}>
      <AuthenticatedShell>
        <Outlet />
      </AuthenticatedShell>
    </OrganizationProvider>
  );
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { isHr } = useOrganization();
  return <AppShell isHr={isHr}>{children}</AppShell>;
}
