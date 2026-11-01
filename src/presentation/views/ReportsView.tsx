import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bot,
  CalendarCheck,
  Check,
  ChevronDown,
  Download,
  FileText,
  Flame,
  Lightbulb,
  Timer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Award,
} from "lucide-react";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useOrganization } from "@/presentation/organization/organization-context";
import { buildReportPdf } from "@/infrastructure/pdf/report-pdf.adapter";
import { reportPdfLabels } from "@/infrastructure/pdf/report-pdf-labels";
import {
  listMyFinishedSessions,
  type PostureSessionRow,
} from "@/infrastructure/supabase/repositories/posture-sessions.repository";
import { getProfileSummary } from "@/infrastructure/supabase/repositories/profiles.repository";
import {
  formatDuration,
  NECK_LIMIT,
  riskLevel,
  TORSO_LIMIT,
  type RiskLevel,
} from "@/domain/posture/posture";
import {
  avg,
  avgScore,
  chronologicalScores,
  currentStreak,
  dailyAverages,
  filterByBounds,
  hourlyAverages,
  peakRiskHour,
  previousBounds,
  rangeBounds,
  sessionsToCsv,
  weekActivity,
  type RangeKey,
} from "@/application/reports/reports-analytics";
import {
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

type RiskFilter = "all" | RiskLevel;

const cellTone: Record<Tone, string> = {
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-muted text-muted-foreground",
};

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-foreground)",
};

export function ReportsView() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { departmentName } = useOrganization();

  const [range, setRange] = useState<RangeKey>("7d");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["my-sessions", user?.id],
    enabled: Boolean(user),
    queryFn: () => listMyFinishedSessions(user!.id),
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user),
    queryFn: () => getProfileSummary(user!.id),
  });

  const all = useMemo(() => sessions ?? [], [sessions]);
  const now = useMemo(() => new Date(), []);

  const view = useMemo(() => {
    const cur = rangeBounds(range, now);
    const inRange = filterByBounds(all, cur.from, cur.to);
    const prevB = previousBounds(range, now);
    const prev = prevB ? filterByBounds(all, prevB.from, prevB.to) : [];
    return { inRange, prev };
  }, [all, range, now]);

  const inRange = view.inRange;
  const filtered = useMemo(
    () =>
      riskFilter === "all" ? inRange : inRange.filter((s) => riskLevel(s.score) === riskFilter),
    [inRange, riskFilter],
  );

  // KPIs
  const avgNow = avgScore(inRange);
  const avgPrev = avgScore(view.prev);
  const delta = inRange.length > 0 && view.prev.length > 0 ? avgNow - avgPrev : null;
  const lowRiskPct =
    inRange.length > 0
      ? Math.round(
          (inRange.filter((s) => riskLevel(s.score) === "low").length / inRange.length) * 100,
        )
      : 0;
  const totalSeconds = inRange.reduce((a, s) => a + s.duration_seconds, 0);
  const totalAlerts = inRange.reduce((a, s) => a + s.alerts_count, 0);
  const avgDuration = inRange.length > 0 ? totalSeconds / inRange.length : 0;
  const streak = currentStreak(all, now);
  const week = weekActivity(all, now);
  const weekdayLabels = t("reports.weekdays").split(",");
  const sparkData = chronologicalScores(inRange).map((score, i) => ({ i, score }));

  // Gráficos / mapas (sobre todo el histórico, no solo el rango filtrado)
  const daily = dailyAverages(all, now, 7);
  const dailyData = daily.map((d) => ({
    label: d.date.toLocaleDateString(locale, { weekday: "short" }),
    score: d.score,
  }));
  const dailyScores = daily.flatMap((d) => (d.score === null ? [] : [d.score]));
  const weekAvg = dailyScores.length > 0 ? Math.round(avg(dailyScores)) : null;
  const hourly = hourlyAverages(inRange);
  const peak = peakRiskHour(hourly);

  // Cumplimiento de límites
  const avgNeck = avg(inRange.map((s) => Number(s.avg_neck_angle)));
  const avgTorso = avg(inRange.map((s) => Number(s.avg_torso_angle)));
  const avgGood = avg(inRange.map((s) => Number(s.good_posture_pct)));

  const formatWhen = (iso: string) => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    const dayDiff = Math.round(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
        86_400_000,
    );
    if (dayDiff === 0) return `${t("reports.today")}, ${time}`;
    if (dayDiff === 1) return `${t("reports.yesterday")}, ${time}`;
    return `${d.toLocaleDateString(locale, { day: "numeric", month: "short" })}, ${time}`;
  };

  const downloadPdf = (s: PostureSessionRow) => {
    const doc = buildReportPdf(
      {
        employeeName: profile?.full_name || "",
        email: profile?.email || user?.email || "",
        department: departmentName || "",
        startedAt: s.started_at,
        durationSeconds: s.duration_seconds,
        goodPosturePct: Number(s.good_posture_pct),
        avgNeckAngle: Number(s.avg_neck_angle),
        avgTorsoAngle: Number(s.avg_torso_angle),
        alertsCount: s.alerts_count,
        score: s.score,
        diagnosis: s.diagnosis ?? "",
        recommendation: s.recommendation ?? "",
      },
      reportPdfLabels(locale),
    );
    doc.save(`posturaia-${s.started_at.slice(0, 10)}.pdf`);
  };

  const exportCsv = () => {
    const csv = sessionsToCsv(filtered);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `posturaia-historico-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Chip tone="success" dot upper>
            {t("reports.eyebrow")}
          </Chip>
        }
        title={t("reports.title")}
        subtitle={t("reports.sub")}
        right={
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <SegmentedTabs
              value={range}
              onChange={setRange}
              options={[
                { value: "7d", label: t("reports.range.7d") },
                { value: "month", label: t("reports.range.month") },
                { value: "all", label: t("reports.range.all") },
              ]}
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Download className="size-4" /> {t("reports.exportCsv")}
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{t("reports.kpi.index")}</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">
                  {inRange.length > 0 ? Math.round(avgNow) : "—"}
                </span>
                <span className="text-lg text-muted-foreground">/100</span>
              </p>
            </div>
            {delta !== null && (
              <Chip
                tone={delta >= 0 ? "success" : "danger"}
                icon={delta >= 0 ? TrendingUp : TrendingDown}
              >
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)} {t("reports.kpi.vsPrev")}
              </Chip>
            )}
          </div>
          <div className="mt-2 h-14">
            {sparkData.length > 1 && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="var(--color-chart-1)"
                    fill="var(--color-chart-1)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t("reports.kpi.optimal")}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success-strong" />
              {lowRiskPct}% {t("reports.kpi.inLowRisk")}
            </span>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{t("reports.kpi.active")}</p>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold">{(totalSeconds / 3600).toFixed(1)}</span>
                <span className="text-lg text-muted-foreground">{t("reports.kpi.hours")}</span>
              </p>
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info-soft-foreground">
              <Timer className="size-5" />
            </span>
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <Stat label={t("reports.kpi.sessionsCount")} value={String(inRange.length)} />
            <Stat
              label={t("reports.kpi.avgDuration")}
              value={`${formatDuration(avgDuration)} ${t("common.minutes")}`}
            />
            <Stat label={t("reports.kpi.alertsTotal")} value={String(totalAlerts)} />
          </dl>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{t("reports.kpi.consistency")}</p>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold">{streak}</span>
                <span className="text-lg text-muted-foreground">{t("reports.kpi.days")}</span>
              </p>
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success-soft-foreground">
              <Flame className="size-5" />
            </span>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {week.map((d, i) => (
              <div
                key={d.key}
                className={`flex h-9 flex-col items-center justify-center rounded-lg text-[11px] font-bold ${
                  d.active
                    ? "bg-success-soft text-success-soft-foreground"
                    : d.future
                      ? "bg-muted/50 text-muted-foreground/50"
                      : "bg-muted text-muted-foreground"
                } ${d.isToday ? "ring-2 ring-primary" : ""}`}
              >
                {d.active ? <Check className="size-3.5" /> : null}
                <span className={d.active ? "sr-only" : ""}>{weekdayLabels[i]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarCheck className="size-3.5" />
            {streak > 0 ? t("reports.kpi.streakHint") : t("reports.kpi.streakNone")}
          </p>
        </Card>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1.45fr_1fr]">
        {/* Sesiones */}
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2.5">
              <span className="size-2.5 rounded-full bg-primary" />
              <h2 className="text-lg font-bold">
                {filtered.length} {t("reports.sessions")}
              </h2>
            </div>
            <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground">
              {t("reports.filter.risk")}:
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
                className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-ring"
              >
                <option value="all">{t("reports.filter.all")}</option>
                <option value="low">{t("reports.risk.low")}</option>
                <option value="mid">{t("reports.risk.mid")}</option>
                <option value="high">{t("reports.risk.high")}</option>
              </select>
            </label>
          </Card>

          {isLoading && <Card>{<EmptyState>{t("common.loading")}</EmptyState>}</Card>}
          {!isLoading && filtered.length === 0 && (
            <Card>
              <EmptyState>{t("reports.empty")}</EmptyState>
            </Card>
          )}

          {filtered.map((s, index) => {
            const risk = riskLevel(s.score);
            const tone = riskTone(risk);
            const open = openState[s.id] ?? index === 0;
            return (
              <Card key={s.id} className="!p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenState((prev) => ({ ...prev, [s.id]: !open }))}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-4 p-5 text-left md:p-6"
                >
                  <span
                    className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${cellTone[tone]}`}
                  >
                    {risk === "high" ? (
                      <TriangleAlert className="size-5" />
                    ) : (
                      <Award className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold">{formatWhen(s.started_at)}</h3>
                      <Chip tone={tone} dot>
                        {s.score}/100 · {t(`reports.risk.${risk}`)}
                      </Chip>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("reports.session.duration")} {formatDuration(s.duration_seconds)}{" "}
                      {t("common.minutes")} · {s.alerts_count} {t("reports.session.alerts")}
                    </p>
                  </div>
                  <ChevronDown
                    className={`size-5 shrink-0 text-muted-foreground transition-transform ${
                      open ? "rotate-180" : ""
                    }`}
                    aria-label={open ? t("reports.session.collapse") : t("reports.session.expand")}
                  />
                </button>

                {open && (
                  <div className="space-y-4 border-t border-border p-5 md:p-6">
                    <div className="grid grid-cols-3 gap-3 rounded-2xl bg-secondary/60 p-4">
                      <Metric
                        label={t("reports.metric.neck")}
                        value={`${Number(s.avg_neck_angle).toFixed(0)}°`}
                        ok={Number(s.avg_neck_angle) <= NECK_LIMIT}
                        hint={`≤ ${NECK_LIMIT}°`}
                      />
                      <Metric
                        label={t("reports.metric.torso")}
                        value={`${Number(s.avg_torso_angle).toFixed(0)}°`}
                        ok={Number(s.avg_torso_angle) <= TORSO_LIMIT}
                        hint={`≤ ${TORSO_LIMIT}°`}
                      />
                      <Metric
                        label={t("reports.metric.good")}
                        value={`${Number(s.good_posture_pct).toFixed(0)}%`}
                        ok={Number(s.good_posture_pct) >= 80}
                        hint={`${s.alerts_count} ${t("reports.session.alerts")}`}
                      />
                    </div>

                    {s.diagnosis || s.recommendation ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {s.diagnosis && (
                          <TextBlock
                            icon={Bot}
                            tone="info"
                            title={t("reports.analyst")}
                            body={s.diagnosis}
                          />
                        )}
                        {s.recommendation && (
                          <TextBlock
                            icon={Lightbulb}
                            tone="warning"
                            title={t("reports.coach")}
                            body={s.recommendation}
                          />
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("reports.noDiagnosis")}</p>
                    )}

                    <button
                      type="button"
                      onClick={() => downloadPdf(s)}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-3.5 py-2 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-muted"
                    >
                      <FileText className="size-4" /> {t("reports.pdf")}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">{t("reports.chart.kicker")}</p>
                <h2 className="mt-1 text-xl font-bold leading-tight">{t("reports.chart.title")}</h2>
              </div>
              {weekAvg !== null && (
                <Chip tone={riskTone(riskLevel(weekAvg))} icon={TrendingUp}>
                  {weekAvg} {t("reports.chart.avg")}
                </Chip>
              )}
            </div>
            {dailyScores.length === 0 ? (
              <EmptyState>{t("reports.chart.empty")}</EmptyState>
            ) : (
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <ReferenceLine
                      y={80}
                      stroke="var(--color-muted-foreground)"
                      strokeDasharray="4 4"
                      label={{
                        value: t("reports.chart.threshold"),
                        fill: "var(--color-muted-foreground)",
                        fontSize: 11,
                        position: "insideBottomRight",
                      }}
                    />
                    <Line
                      name={t("reports.chart.score")}
                      type="monotone"
                      dataKey="score"
                      connectNulls
                      stroke="var(--color-chart-1)"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "var(--color-card)", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <p className="eyebrow">{t("reports.heat.kicker")}</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold leading-tight">{t("reports.heat.title")}</h2>
              {peak && peak.risk !== "low" && (
                <Chip tone={riskTone(peak.risk)} dot>
                  {t("reports.heat.peak")}: {String(peak.hour).padStart(2, "0")}:00
                </Chip>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t("reports.heat.sub")}</p>
            {hourly.length === 0 ? (
              <EmptyState>{t("reports.heat.empty")}</EmptyState>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {hourly.map((h) => (
                    <div key={h.hour} className="text-center">
                      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                        {String(h.hour).padStart(2, "0")}h
                      </p>
                      <div
                        className={`rounded-lg py-2 text-xs font-bold ${cellTone[riskTone(h.risk)]}`}
                        title={`${h.count} ${t("reports.kpi.sessionsCount")}`}
                      >
                        {h.score}
                      </div>
                    </div>
                  ))}
                </div>
                {peak && (
                  <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
                    {peak.risk === "low"
                      ? t("reports.heat.fine")
                      : t("reports.heat.peakAt")
                          .replace("{h}", String(peak.hour).padStart(2, "0"))
                          .replace("{s}", String(peak.score))}
                  </p>
                )}
              </>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t("reports.limits.title")}
              subtitle={t("reports.limits.kicker")}
              className="mb-4"
            />
            {inRange.length === 0 ? (
              <EmptyState>{t("reports.limits.empty")}</EmptyState>
            ) : (
              <div className="space-y-4">
                <LimitRow
                  label={t("reports.limits.neck")}
                  value={`${avgNeck.toFixed(1)}° (≤ ${NECK_LIMIT}°)`}
                  pct={(avgNeck / NECK_LIMIT) * 100}
                  ok={avgNeck <= NECK_LIMIT}
                  okLabel={t("reports.limits.ok")}
                  warnLabel={t("reports.limits.warn")}
                />
                <LimitRow
                  label={t("reports.limits.torso")}
                  value={`${avgTorso.toFixed(1)}° (≤ ${TORSO_LIMIT}°)`}
                  pct={(avgTorso / TORSO_LIMIT) * 100}
                  ok={avgTorso <= TORSO_LIMIT}
                  okLabel={t("reports.limits.ok")}
                  warnLabel={t("reports.limits.warn")}
                />
                <LimitRow
                  label={t("reports.limits.good")}
                  value={`${avgGood.toFixed(0)}% (≥ 80%)`}
                  pct={avgGood}
                  ok={avgGood >= 80}
                  okLabel={t("reports.limits.ok")}
                  warnLabel={t("reports.limits.warn")}
                />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-lg font-bold leading-tight">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function Metric({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  hint: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-none">{value}</p>
      <p
        className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${toneText[ok ? "success" : "danger"]}`}
      >
        <span className="size-1.5 rounded-full bg-current" />
        {hint}
      </p>
    </div>
  );
}

function TextBlock({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: typeof Bot;
  tone: Tone;
  title: string;
  body: string;
}) {
  return (
    <div className={`rounded-2xl p-4 ${cellTone[tone]}`}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
        <Icon className="size-4" /> {title}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">{body}</p>
    </div>
  );
}

function LimitRow({
  label,
  value,
  pct,
  ok,
  okLabel,
  warnLabel,
}: {
  label: string;
  value: string;
  pct: number;
  ok: boolean;
  okLabel: string;
  warnLabel: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className={`font-semibold ${toneText[ok ? "success" : "danger"]}`}>
          {value} · {ok ? okLabel : warnLabel}
        </span>
      </div>
      <ProgressBar value={pct} tone={ok ? "success" : "danger"} className="mt-2" />
    </div>
  );
}
