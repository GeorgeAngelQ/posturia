import { Fragment, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Gauge,
  Lightbulb,
  Lock,
  Search,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useI18n } from "@/presentation/i18n/i18n";
import { useOrganization } from "@/presentation/organization/organization-context";
import { riskLevel, type RiskLevel } from "@/domain/posture/posture";
import { listAllFinishedSessions } from "@/infrastructure/supabase/repositories/posture-sessions.repository";
import { listOrgMembers } from "@/infrastructure/supabase/repositories/members.repository";
import { getOrganization } from "@/infrastructure/supabase/repositories/organizations.repository";
import { getOrgPrivacyMode } from "@/infrastructure/supabase/repositories/privacy.repository";
import { avg, hourlyAverages, peakRiskHour } from "@/application/reports/reports-analytics";
import {
  departmentRows,
  employeeRows,
  employeesToCsv,
  hrBounds,
  inWindow,
  scoreBand,
  trendSeries,
  type HrRange,
  type ScoreBand,
  maskEmployeeRows,
  reserveSmallGroups,
} from "@/application/reports/hr-analytics";
import {
  Avatar,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  PageHeader,
  ProgressBar,
  SegmentedTabs,
  riskTone,
  toneText,
  type Tone,
} from "@/presentation/components/kit";

const PAGE_SIZE = 5;
const NO_DEPT = "__none__";

const bandTone: Record<ScoreBand, Tone> = {
  excellent: "success",
  good: "info",
  moderate: "warning",
  attention: "danger",
};

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-foreground)",
};

const selectClass =
  "h-10 rounded-xl border border-input bg-secondary px-3 text-sm text-foreground outline-none focus:border-ring";

/** Reemplaza `{clave}` en un texto traducido (el `t()` base no admite parámetros). */
function fmt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export function HrView() {
  const { t, locale } = useI18n();
  const { membership, isHr, loading: orgLoading } = useOrganization();
  const orgId = membership?.orgId;
  const dateLocale = locale === "es" ? "es-ES" : "en-US";

  const [range, setRange] = useState<HrRange>("month");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["hr-overview", orgId],
    enabled: Boolean(isHr && orgId),
    queryFn: async () => {
      const [sessions, members] = await Promise.all([
        listAllFinishedSessions(orgId!),
        listOrgMembers(orgId!),
      ]);
      return { sessions, members };
    },
  });

  const orgQuery = useQuery({
    queryKey: ["org-info", orgId],
    enabled: Boolean(isHr && orgId),
    queryFn: () => getOrganization(orgId!),
  });

  const privacyQuery = useQuery({
    queryKey: ["org-privacy", orgId],
    enabled: Boolean(isHr && orgId),
    queryFn: () => getOrgPrivacyMode(orgId!),
  });
  const aggregateMode = privacyQuery.data === "aggregate";
  const pseudonymPrefix = t("hr.privacy.pseudonym");

  const now = useMemo(() => new Date(), []);
  const allSessions = useMemo(() => data?.sessions ?? [], [data]);
  const members = useMemo(() => data?.members ?? [], [data]);

  const analysis = useMemo(() => {
    const b = hrBounds(range, now);
    const inRange = inWindow(allSessions, b.from, b.to);
    const prevRange = inWindow(allSessions, b.prevFrom, b.from);
    const rawRows = employeeRows(inRange, members);
    const rows = aggregateMode ? maskEmployeeRows(rawRows, pseudonymPrefix) : rawRows;
    const allDepts = departmentRows(rows, members);
    const depts = aggregateMode ? reserveSmallGroups(allDepts) : allDepts;
    const hiddenDepts = allDepts.length - depts.length;
    const trend = trendSeries(allSessions, range, now);
    const hourly = hourlyAverages(inRange);
    return { b, inRange, prevRange, rows, depts, hiddenDepts, trend, peak: peakRiskHour(hourly) };
  }, [allSessions, members, range, now, aggregateMode, pseudonymPrefix]);

  const deptOptions = useMemo(() => {
    const names = new Set<string>();
    let hasNone = false;
    for (const r of analysis.rows) {
      if (r.department) names.add(r.department);
      else hasNone = true;
    }
    return { names: [...names].sort((a, b) => a.localeCompare(b)), hasNone };
  }, [analysis.rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return analysis.rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) {
        return false;
      }
      if (deptFilter === NO_DEPT && r.department !== null) return false;
      if (deptFilter !== "all" && deptFilter !== NO_DEPT && r.department !== deptFilter) {
        return false;
      }
      if (riskFilter !== "all" && r.risk !== riskFilter) return false;
      return true;
    });
  }, [analysis.rows, search, deptFilter, riskFilter]);

  if (orgLoading || (isHr && isLoading)) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!isHr) {
    return (
      <Card>
        <EmptyState>{t("hr.noAccess")}</EmptyState>
      </Card>
    );
  }

  const { b, inRange, prevRange, rows, depts, hiddenDepts, trend, peak } = analysis;

  const monitored = rows.length;
  const totalMembers = Math.max(members.length, monitored);
  const coverage = totalMembers > 0 ? (monitored / totalMembers) * 100 : 0;
  const totalHours = inRange.reduce((a, s) => a + s.duration_seconds, 0) / 3600;
  const totalAlerts = inRange.reduce((a, s) => a + s.alerts_count, 0);
  const avgNow = avg(inRange.map((s) => s.score));
  const avgPrev = avg(prevRange.map((s) => s.score));
  const scoreDelta = inRange.length > 0 && prevRange.length > 0 ? avgNow - avgPrev : null;
  const sessionsDelta =
    prevRange.length > 0 ? ((inRange.length - prevRange.length) / prevRange.length) * 100 : null;
  const highRisk = rows.filter((r) => r.risk === "high").length;
  const globalBand = scoreBand(avgNow);

  const lastDay = new Date(b.to.getTime() - 24 * 60 * 60 * 1000);
  const dayMonth: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const rangeLabel = `${b.from.toLocaleDateString(dateLocale, dayMonth)} – ${lastDay.toLocaleDateString(
    dateLocale,
    { ...dayMonth, year: "numeric" },
  )}`;

  const chartData = trend.map((p) => ({
    label:
      range === "week"
        ? p.date.toLocaleDateString(dateLocale, { weekday: "short" })
        : p.date.toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit" }),
    current: p.current,
    previous: p.previous,
  }));
  const hasTrend = chartData.some((p) => p.current !== null);
  const hasPrevious = chartData.some((p) => p.previous !== null);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showFrom = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showTo = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const worstDept = depts.length > 1 ? depts[depts.length - 1]! : null;
  const deptLabel = (name: string | null) => name ?? t("hr.dept.none");

  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([employeesToCsv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `posturaia-rrhh-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showAffected = () => {
    setRiskFilter("high");
    setDeptFilter("all");
    setSearch("");
    setPage(1);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pauseHour = peak ? `${String((peak.hour + 23) % 24).padStart(2, "0")}:50` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("hr.title")}
        subtitle={t("hr.sub")}
        chips={
          <>
            <Chip tone="info" icon={ShieldCheck} upper>
              {t("hr.chip.restricted")}
            </Chip>
            <Chip tone="success" icon={Lock}>
              {t("hr.chip.isolated")}
            </Chip>
            {aggregateMode && (
              <Chip tone="warning" icon={ShieldCheck} title={t("hr.privacy.aggregateHint")}>
                {t("hr.privacy.aggregateChip")}
                {hiddenDepts > 0 ? ` · ${hiddenDepts} ${t("hr.privacy.hiddenDepts")}` : ""}
              </Chip>
            )}
            {orgQuery.data?.name && (
              <Chip tone="neutral" icon={Building2}>
                {orgQuery.data.name}
              </Chip>
            )}
            <Chip tone="neutral" icon={Users}>
              {monitored} {t("hr.chip.activeSuffix")}
            </Chip>
          </>
        }
        right={
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground">
              <CalendarDays className="size-4 text-primary" /> {rangeLabel}
            </span>
            <SegmentedTabs
              value={range}
              onChange={(v) => {
                setRange(v);
                setPage(1);
                setOpenId(null);
              }}
              options={[
                { value: "week", label: t("hr.range.week") },
                { value: "month", label: t("hr.range.month") },
                { value: "quarter", label: t("hr.range.quarter") },
              ]}
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0 || aggregateMode}
              title={aggregateMode ? t("hr.privacy.exportBlocked") : undefined}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Download className="size-4" /> {t("hr.export")}
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">{t("hr.kpi.members")}</p>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success-soft-foreground">
              <Users className="size-4" />
            </span>
          </div>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold">{monitored}</span>
            <span className="text-lg text-muted-foreground">/ {totalMembers}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("hr.kpi.membersHint")}</p>
          <div className="mt-4">
            <ProgressBar value={coverage} tone="success" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("hr.kpi.coverage")}: {Math.round(coverage)}%
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">{t("hr.kpi.sessions")}</p>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info-soft-foreground">
              <Timer className="size-4" />
            </span>
          </div>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold">{inRange.length}</span>
            {sessionsDelta !== null && (
              <Chip
                tone={sessionsDelta >= 0 ? "success" : "danger"}
                icon={sessionsDelta >= 0 ? TrendingUp : TrendingDown}
                className="ml-1 whitespace-nowrap"
              >
                {sessionsDelta >= 0 ? "+" : ""}
                {Math.round(sessionsDelta)}%
              </Chip>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalHours.toFixed(1)} {t("hr.kpi.hours")}
            {sessionsDelta !== null && ` · ${t("hr.vsPrev")}`}
          </p>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("hr.kpi.perPerson")}</span>
            <span className="font-semibold text-foreground">
              {monitored > 0 ? (totalHours / monitored).toFixed(1) : "0.0"} {t("hr.kpi.hours")}
            </span>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">{t("hr.kpi.score")}</p>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info-soft-foreground">
              <Gauge className="size-4" />
            </span>
          </div>
          <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
            <span className="text-4xl font-extrabold">
              {inRange.length > 0 ? avgNow.toFixed(1) : "—"}
            </span>
            <span className="text-lg text-muted-foreground">/ 100</span>
            {inRange.length > 0 && (
              <Chip tone={bandTone[globalBand]} className="ml-1 whitespace-nowrap">
                {t(`hr.band.${globalBand}`)}
              </Chip>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("hr.kpi.scoreHint")}</p>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            {scoreDelta !== null ? (
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  scoreDelta >= 0 ? "text-success-strong" : "text-danger-strong"
                }`}
              >
                {scoreDelta >= 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {scoreDelta >= 0 ? "+" : ""}
                {scoreDelta.toFixed(1)} {t("hr.vsPrev")}
              </span>
            ) : (
              <span />
            )}
            <span>
              {t("hr.kpi.alerts")}:{" "}
              <span className="font-semibold text-foreground">{totalAlerts}</span>
            </span>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">{t("hr.kpi.risk")}</p>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger-soft-foreground">
              <TriangleAlert className="size-4" />
            </span>
          </div>
          <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
            <span className={`text-4xl font-extrabold ${highRisk > 0 ? "text-danger-strong" : ""}`}>
              {highRisk}
            </span>
            <span className="text-lg text-muted-foreground">{t("hr.kpi.riskUnit")}</span>
            {highRisk > 0 && (
              <Chip tone="danger" className="ml-1 whitespace-nowrap">
                {t("hr.kpi.actionNeeded")}
              </Chip>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {highRisk > 0 ? t("hr.kpi.riskHint") : t("hr.kpi.noRisk")}
          </p>
          {highRisk > 0 && (
            <button
              type="button"
              onClick={showAffected}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-soft-foreground transition-opacity hover:opacity-80"
            >
              {t("hr.kpi.viewCases")} <ArrowRight className="size-3.5" />
            </button>
          )}
        </Card>
      </div>

      {/* Tendencia + salud por departamento */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title={t("hr.trend.title")}
            subtitle={t("hr.trend.sub")}
            right={
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-chart-1" /> {t("hr.trend.current")}
                </span>
                {hasPrevious && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-chart-2" /> {t("hr.trend.previous")}
                  </span>
                )}
              </div>
            }
          />
          <div className="mt-4 h-64 rounded-2xl bg-muted/50 p-3">
            {hasTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="hrTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="previous"
                    name={t("hr.trend.previous")}
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    fill="none"
                    connectNulls
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="current"
                    name={t("hr.trend.current")}
                    stroke="var(--color-chart-1)"
                    strokeWidth={2.5}
                    fill="url(#hrTrendFill)"
                    connectNulls
                    dot={{ r: 3, strokeWidth: 0, fill: "var(--color-chart-1)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState>{t("hr.trend.empty")}</EmptyState>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-info-soft p-4 text-info-soft-foreground">
            <Lightbulb className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{t("hr.insight.title")}</p>
              <p className="mt-1 text-sm leading-relaxed">
                {peak
                  ? fmt(t("hr.insight.body"), {
                      h: String(peak.hour).padStart(2, "0"),
                      score: peak.score,
                      pause: pauseHour,
                    })
                  : t("hr.insight.none")}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("hr.dept.title")} subtitle={t("hr.dept.sub")} />
          {depts.length === 0 ? (
            <EmptyState>{t("hr.dept.empty")}</EmptyState>
          ) : (
            <ul className="mt-4 space-y-3">
              {depts.map((d) => {
                const band = scoreBand(d.score);
                return (
                  <li key={d.name ?? NO_DEPT} className="rounded-2xl bg-muted/50 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{deptLabel(d.name)}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(t("hr.dept.members"), { m: d.monitored, t: d.total })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Chip tone={bandTone[band]} className="whitespace-nowrap">
                          {t(`hr.band.${band}`)}
                        </Chip>
                        <span className="text-lg font-extrabold">{d.score}</span>
                      </div>
                    </div>
                    <ProgressBar value={d.score} tone={bandTone[band]} className="mt-3" />
                  </li>
                );
              })}
            </ul>
          )}
          {worstDept && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-secondary p-3 text-xs leading-relaxed text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {fmt(t("hr.dept.worst"), { d: deptLabel(worstDept.name), s: worstDept.score })}
            </p>
          )}
        </Card>
      </div>

      {/* Seguimiento individual */}
      <div ref={tableRef} className="scroll-mt-24">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{t("hr.table.title")}</h2>
                <Chip tone="info" className="whitespace-nowrap">
                  {rows.length} {t("hr.table.records")}
                </Chip>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("hr.table.sub")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={t("hr.search")}
                  aria-label={t("hr.search")}
                  className="h-10 w-72 max-w-full rounded-xl border border-input bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
                />
              </label>
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setPage(1);
                }}
                aria-label={t("hr.col.dept")}
                className={selectClass}
              >
                <option value="all">{t("hr.filter.allDepts")}</option>
                {deptOptions.names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                {deptOptions.hasNone && <option value={NO_DEPT}>{t("hr.dept.none")}</option>}
              </select>
              <select
                value={riskFilter}
                onChange={(e) => {
                  setRiskFilter(e.target.value as "all" | RiskLevel);
                  setPage(1);
                }}
                aria-label={t("hr.col.level")}
                className={selectClass}
              >
                <option value="all">{t("hr.filter.allLevels")}</option>
                <option value="low">{t("hr.level.low")}</option>
                <option value="mid">{t("hr.level.mid")}</option>
                <option value="high">{t("hr.level.high")}</option>
              </select>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState>{t("hr.noData")}</EmptyState>
          ) : (
            <>
              <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-left">
                      {(
                        [
                          "hr.col.employee",
                          "hr.col.dept",
                          "hr.col.sessions",
                          "hr.col.score",
                          "hr.col.level",
                          "hr.col.last",
                          "hr.col.action",
                        ] as const
                      ).map((k) => (
                        <th key={k} className="eyebrow px-4 py-3">
                          {t(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState>{t("hr.empty")}</EmptyState>
                        </td>
                      </tr>
                    )}
                    {pageRows.map((r) => {
                      const tone = riskTone(r.risk);
                      const open = openId === r.userId;
                      return (
                        <Fragment key={r.userId}>
                          <tr className="border-t border-border align-middle">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar name={r.name} />
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{r.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {r.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {deptLabel(r.department)}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold">
                                {(r.totalSeconds / 3600).toFixed(1)} {t("hr.kpi.hours")}
                              </p>
                              <p className="whitespace-nowrap text-xs text-muted-foreground">
                                ({r.sessions} {t("hr.col.sessions").toLowerCase()})
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className={`w-10 font-bold ${toneText[tone]}`}>
                                  {r.score.toFixed(1)}
                                </span>
                                <ProgressBar value={r.score} tone={tone} className="w-20" />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Chip tone={tone} dot className="whitespace-nowrap">
                                {t(`hr.level.${riskLevel(r.score)}`)}
                              </Chip>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">
                                {new Date(r.lastStartedAt).toLocaleDateString(dateLocale, {
                                  day: "2-digit",
                                  month: "short",
                                })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t("hr.neck")} {r.lastNeck.toFixed(0)}° · {t("hr.torso")}{" "}
                                {r.lastTorso.toFixed(0)}°
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setOpenId(open ? null : r.userId)}
                                aria-expanded={open}
                                className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted"
                              >
                                {open ? t("hr.hideDiagnosis") : t("hr.diagnosis")}
                                <ChevronDown
                                  className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                                />
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr className="border-t border-border bg-muted/40">
                              <td colSpan={7} className="px-4 py-4">
                                {r.lastDiagnosis || r.lastRecommendation ? (
                                  <div className="grid gap-4 md:grid-cols-2">
                                    {r.lastDiagnosis && (
                                      <div>
                                        <p className="eyebrow text-primary">
                                          {t("agents.analyst")}
                                        </p>
                                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                          {r.lastDiagnosis}
                                        </p>
                                      </div>
                                    )}
                                    {r.lastRecommendation && (
                                      <div>
                                        <p className="eyebrow text-primary">{t("agents.coach")}</p>
                                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                          {r.lastRecommendation}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    {t("hr.noDiagnosis")}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <p>{fmt(t("hr.showing"), { a: showFrom, b: showTo, n: filtered.length })}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <ChevronLeft className="size-3.5" /> {t("hr.prev")}
                  </button>
                  <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                    {t("hr.page")} {currentPage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                    disabled={currentPage >= pageCount}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {t("hr.next")} <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
