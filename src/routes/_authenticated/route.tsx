import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/presentation/components/AppShell";
import { listUserRoles } from "@/infrastructure/supabase/repositories/roles.repository";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useI18n } from "@/presentation/i18n/i18n";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [isHr, setIsHr] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    listUserRoles(user.id).then((roles) => setIsHr(roles.some((r) => r.role === "hr")));
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <AppShell isHr={isHr}>
      <Outlet />
    </AppShell>
  );
}
