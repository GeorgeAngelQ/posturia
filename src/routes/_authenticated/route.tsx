import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/presentation/components/AppShell";
import { OrganizationProvider } from "@/presentation/organization/organization-context";
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
      <AppShell>
        <Outlet />
      </AppShell>
    </OrganizationProvider>
  );
}
