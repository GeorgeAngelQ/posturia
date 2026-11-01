import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  PersonStanding,
  Settings,
  ShieldCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { supabase } from "@/infrastructure/supabase/client";
import { getOrganization } from "@/infrastructure/supabase/repositories/organizations.repository";
import { getProfileSummary } from "@/infrastructure/supabase/repositories/profiles.repository";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useOrganization } from "@/presentation/organization/organization-context";
import { LocaleSwitch } from "./LocaleSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { Avatar, Chip } from "./kit";

type NavTo = "/monitor" | "/reports" | "/hr" | "/org-settings";

const SIDEBAR_KEY = "posturaia.sidebar";

const CRUMBS: Array<{ prefix: string; key: string }> = [
  { prefix: "/reports", key: "shell.crumb.reports" },
  { prefix: "/hr", key: "shell.crumb.hr" },
  { prefix: "/org-settings", key: "shell.crumb.org" },
  { prefix: "/monitor", key: "shell.crumb.monitor" },
];

/**
 * Shell de las vistas autenticadas: sidebar (marca, organización, navegación por rol,
 * usuario) + barra superior (breadcrumb, badge de procesamiento local, idioma, tema).
 * En pantallas < lg el sidebar es un cajón que se abre desde la barra superior.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { membership, isHr } = useOrganization();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "collapsed");
    } catch {
      /* sin almacenamiento: queda expandido */
    }
  }, []);

  // Al navegar, el cajón móvil se cierra.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, c ? "expanded" : "collapsed");
      } catch {
        /* ignorar */
      }
      return !c;
    });
  };

  const orgId = membership?.orgId;
  const orgQuery = useQuery({
    queryKey: ["org-info", orgId],
    enabled: Boolean(orgId),
    queryFn: () => getOrganization(orgId!),
  });
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user),
    queryFn: () => getProfileSummary(user!.id),
  });

  const displayName = profileQuery.data?.full_name || user?.email || "";
  const roleLabel = membership ? t(`org.role.${membership.role}`) : "";
  const crumb = CRUMBS.find((c) => pathname.startsWith(c.prefix));

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  // En el cajón móvil nunca se muestra colapsado.
  const compact = collapsed && !mobileOpen;

  const sidebar = (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      } ${collapsed ? "lg:w-[88px]" : "lg:w-[280px]"}`}
    >
      <div
        className={`flex items-center gap-3 px-5 pb-4 pt-5 ${compact ? "lg:justify-center lg:px-3" : ""}`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info-soft-foreground">
          <PersonStanding className="size-6" />
        </span>
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold leading-tight">
              Postura<span className="text-primary">IA</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{t("shell.brandSub")}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={t("shell.closeMenu")}
          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary lg:hidden"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Organización activa */}
      <div className={`px-4 ${compact ? "lg:px-3" : ""}`}>
        <div
          className={`flex items-center gap-3 rounded-2xl border border-border bg-secondary/60 p-3 ${
            compact ? "lg:justify-center lg:p-2" : ""
          }`}
          title={orgQuery.data?.name}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-info-soft-foreground shadow-sm">
            <ShieldCheck className="size-5" />
          </span>
          {!compact && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">
                {orgQuery.data?.name ?? (membership ? "…" : t("shell.noOrg"))}
              </p>
              {orgQuery.data?.plan && (
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {t("shell.plan")} {orgQuery.data.plan}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto px-4">
        <NavSection label={t("shell.sectionPlatform")} compact={compact}>
          <NavItem to="/monitor" icon={Video} label={t("nav.monitor")} compact={compact} />
          <NavItem to="/reports" icon={BarChart3} label={t("nav.reports")} compact={compact} />
        </NavSection>
        {isHr && (
          <NavSection label={t("shell.sectionHealth")} compact={compact}>
            <NavItem
              to="/hr"
              icon={Users}
              label={t("nav.hr")}
              badge={t("shell.roleBadge.hr")}
              compact={compact}
            />
            <NavItem
              to="/org-settings"
              icon={Settings}
              label={t("nav.org")}
              badge={
                membership?.role === "owner" ? t("shell.roleBadge.owner") : t("shell.roleBadge.hr")
              }
              compact={compact}
            />
          </NavSection>
        )}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div
          className={`flex items-center gap-3 rounded-2xl border border-border bg-secondary/60 p-3 ${
            compact ? "lg:justify-center lg:p-2" : ""
          }`}
        >
          <Avatar name={displayName || "?"} dot />
          {!compact && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold leading-tight">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                aria-label={t("shell.signout")}
                title={t("shell.signout")}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </>
          )}
        </div>
        {compact && (
          <button
            type="button"
            onClick={signOut}
            aria-label={t("shell.signout")}
            title={t("shell.signout")}
            className="hidden w-full items-center justify-center rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground lg:flex"
          >
            <LogOut className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`hidden w-full items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground lg:flex ${
            compact ? "justify-center" : ""
          }`}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!compact && t("shell.collapse")}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      {sidebar}
      {mobileOpen && (
        <button
          type="button"
          aria-label={t("shell.closeMenu")}
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 md:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t("shell.openMenu")}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">{t("shell.platform")}</span>
              <span className="hidden text-muted-foreground sm:inline">›</span>
              <span className="truncate font-semibold">{crumb ? t(crumb.key) : ""}</span>
            </nav>
            <Chip tone="success" dot className="hidden md:inline-flex">
              {t("shell.localBadge")}
            </Chip>

            <div className="ml-auto flex items-center gap-2 md:gap-3">
              <LocaleSwitch />
              <ThemeToggle />
              <div className="hidden items-center gap-3 border-l border-border pl-3 md:flex">
                <Avatar name={displayName || "?"} />
                <div className="hidden leading-tight xl:block">
                  <p className="max-w-[160px] truncate text-sm font-bold">{displayName}</p>
                  <p className="text-xs text-success-strong">{t("shell.online")}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavSection({
  label,
  compact,
  children,
}: {
  label: string;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      {!compact && <p className="eyebrow mb-2 px-3">{label}</p>}
      {compact && <div className="mx-3 mb-2 hidden border-t border-sidebar-border lg:block" />}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  badge,
  compact,
}: {
  to: NavTo;
  icon: ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  compact: boolean;
}) {
  return (
    <Link
      to={to}
      title={label}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${
        compact ? "lg:justify-center lg:px-2" : ""
      }`}
      activeProps={{ className: "bg-primary! text-primary-foreground! hover:bg-primary!" }}
    >
      <Icon className="size-5 shrink-0" />
      {!compact && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!compact && badge && (
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success-soft-foreground">
          {badge}
        </span>
      )}
    </Link>
  );
}
