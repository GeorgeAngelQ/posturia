import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { formatDuration, riskLevel } from "@/domain/posture/posture";
import { hasHrRole } from "@/infrastructure/supabase/repositories/roles.repository";
import { listAllFinishedSessions } from "@/infrastructure/supabase/repositories/posture-sessions.repository";
import { listAllProfiles } from "@/infrastructure/supabase/repositories/profiles.repository";

export function HrView() {
  const { t } = useI18n();
  const { user } = useAuth();

  const { data: isHr, isLoading: roleLoading } = useQuery({
    queryKey: ["is-hr", user?.id],
    enabled: Boolean(user),
    queryFn: () => hasHrRole(user!.id),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["hr-overview"],
    enabled: Boolean(isHr),
    queryFn: async () => {
      const [sessions, profiles] = await Promise.all([
        listAllFinishedSessions(),
        listAllProfiles(),
      ]);
      return { sessions, profiles };
    },
  });

  if (roleLoading || (isHr && isLoading)) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!isHr) {
    return <div className="panel p-6 text-sm text-muted-foreground">{t("hr.noAccess")}</div>;
  }

  const sessions = data?.sessions ?? [];
  const profiles = data?.profiles ?? [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const totalAlerts = sessions.reduce((acc, s) => acc + s.alerts_count, 0);
  const avgScore =
    sessions.length > 0
      ? Math.round(sessions.reduce((a, s) => a + s.score, 0) / sessions.length)
      : 0;
  const monitored = new Set(sessions.map((s) => s.user_id)).size;

  const byEmployee = Array.from(new Set(sessions.map((s) => s.user_id))).map((uid) => {
    const own = sessions.filter((s) => s.user_id === uid);
    const score = Math.round(own.reduce((a, s) => a + s.score, 0) / own.length);
    const p = profileById.get(uid);
    return {
      uid,
      name: p?.full_name || p?.email || uid.slice(0, 8),
      department: p?.department || "—",
      sessions: own.length,
      alerts: own.reduce((a, s) => a + s.alerts_count, 0),
      score,
      lastSession: own[0]?.started_at ?? null,
      totalTime: own.reduce((a, s) => a + s.duration_seconds, 0),
    };
  });

  const deptMap = new Map<string, { total: number; count: number }>();
  byEmployee.forEach((e) => {
    const cur = deptMap.get(e.department) ?? { total: 0, count: 0 };
    cur.total += e.score;
    cur.count += 1;
    deptMap.set(e.department, cur);
  });
  const byDept = Array.from(deptMap.entries()).map(([dept, v]) => ({
    dept,
    score: Math.round(v.total / v.count),
  }));

  const trend = sessions
    .slice(0, 12)
    .reverse()
    .map((s) => ({
      label: new Date(s.started_at).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
      }),
      score: s.score,
    }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{t("hr.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("hr.sub")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("hr.employees")} value={String(monitored)} />
        <Kpi label={t("hr.sessions")} value={String(sessions.length)} />
        <Kpi label={t("hr.avgScore")} value={`${avgScore}/100`} />
        <Kpi label={t("hr.totalAlerts")} value={String(totalAlerts)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("hr.trend")}
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-foreground)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("hr.byDept")}
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDept}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="dept" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-foreground)",
                  }}
                />
                <Bar dataKey="score" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="panel overflow-x-auto p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("hr.byEmployee")}
        </h2>
        <table className="mt-4 w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-3">{t("hr.employee")}</th>
              <th className="pb-3">{t("hr.dept")}</th>
              <th className="pb-3">{t("hr.sessions")}</th>
              <th className="pb-3">{t("monitor.alerts")}</th>
              <th className="pb-3">{t("monitor.score")}</th>
              <th className="pb-3">{t("hr.lastSession")}</th>
              <th className="pb-3">{t("hr.risk")}</th>
            </tr>
          </thead>
          <tbody>
            {byEmployee.map((e) => {
              const risk = riskLevel(e.score);
              return (
                <tr key={e.uid} className="border-t border-border">
                  <td className="py-3 font-medium">{e.name}</td>
                  <td className="py-3 text-muted-foreground">{e.department}</td>
                  <td className="py-3 text-muted-foreground">
                    {e.sessions} · {formatDuration(e.totalTime)}
                  </td>
                  <td className="py-3 text-muted-foreground">{e.alerts}</td>
                  <td className="py-3 font-semibold">{e.score}</td>
                  <td className="py-3 text-muted-foreground">
                    {e.lastSession ? new Date(e.lastSession).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        risk === "low"
                          ? "bg-success text-success-foreground"
                          : risk === "mid"
                            ? "bg-warning text-warning-foreground"
                            : "bg-destructive text-destructive-foreground"
                      }`}
                    >
                      {t(`hr.risk.${risk}`)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}
