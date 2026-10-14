import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, FileText, LogOut, Users } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/infrastructure/supabase/client";
import { useI18n } from "@/presentation/i18n/i18n";
import { LocaleSwitch } from "./LocaleSwitch";

export function AppShell({ children, isHr }: { children: ReactNode; isHr: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const linkClass =
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/monitor" className="mr-2 font-display text-lg font-bold text-foreground">
            Postura<span className="text-primary">IA</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1">
            <Link
              to="/monitor"
              className={linkClass}
              activeProps={{ className: "text-foreground" }}
            >
              <Activity className="size-4" /> {t("nav.monitor")}
            </Link>
            <Link
              to="/reports"
              className={linkClass}
              activeProps={{ className: "text-foreground" }}
            >
              <FileText className="size-4" /> {t("nav.reports")}
            </Link>
            {isHr && (
              <Link to="/hr" className={linkClass} activeProps={{ className: "text-foreground" }}>
                <Users className="size-4" /> {t("nav.hr")}
              </Link>
            )}
          </nav>
          <LocaleSwitch />
          <button onClick={signOut} className={linkClass}>
            <LogOut className="size-4" /> {t("nav.signout")}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
