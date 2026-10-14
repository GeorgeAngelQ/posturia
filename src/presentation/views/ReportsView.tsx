import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { buildReportPdf } from "@/infrastructure/pdf/report-pdf.adapter";
import { listMyFinishedSessions } from "@/infrastructure/supabase/repositories/posture-sessions.repository";
import { getProfileSummary } from "@/infrastructure/supabase/repositories/profiles.repository";
import { formatDuration, riskLevel } from "@/domain/posture/posture";

export function ReportsView() {
  const { t } = useI18n();
  const { user } = useAuth();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["my-sessions", user?.id],
    enabled: Boolean(user),
    queryFn: listMyFinishedSessions,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user),
    queryFn: () => getProfileSummary(user!.id),
  });

  const download = (s: NonNullable<typeof sessions>[number]) => {
    const doc = buildReportPdf(
      {
        employeeName: profile?.full_name || "",
        email: profile?.email || user?.email || "",
        department: profile?.department || "",
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
      {
        title: t("report.title"),
        employee: t("hr.employee"),
        dept: t("hr.dept"),
        date: t("reports.date"),
        duration: t("reports.duration"),
        goodPct: t("monitor.goodPct"),
        neck: t("monitor.neck"),
        torso: t("monitor.torso"),
        alerts: t("monitor.alerts"),
        score: t("monitor.score"),
        diagnosis: t("agents.analyst"),
        recommendation: t("agents.coach"),
        footer: `PosturaIA · ${t("landing.privacy")}`,
      },
    );
    doc.save(`posturaia-${s.started_at.slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("reports.title")}</h1>

      {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {!isLoading && (sessions?.length ?? 0) === 0 && (
        <div className="panel p-6 text-sm text-muted-foreground">{t("reports.empty")}</div>
      )}

      <div className="space-y-4">
        {sessions?.map((s) => {
          const risk = riskLevel(s.score);
          return (
            <article key={s.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(s.started_at).toLocaleString()} · {formatDuration(s.duration_seconds)}{" "}
                    {t("common.minutes")}
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">
                    {s.score}
                    <span className="text-base text-muted-foreground">/100</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      risk === "low"
                        ? "bg-success text-success-foreground"
                        : risk === "mid"
                          ? "bg-warning text-warning-foreground"
                          : "bg-destructive text-destructive-foreground"
                    }`}
                  >
                    {t(`hr.risk.${risk}`)}
                  </span>
                  <button
                    onClick={() => download(s)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted"
                  >
                    <Download className="size-4" /> {t("report.download")}
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <Info
                  label={t("monitor.goodPct")}
                  value={`${Number(s.good_posture_pct).toFixed(0)}%`}
                />
                <Info label={t("monitor.neck")} value={`${Number(s.avg_neck_angle).toFixed(0)}°`} />
                <Info
                  label={t("monitor.torso")}
                  value={`${Number(s.avg_torso_angle).toFixed(0)}°`}
                />
                <Info label={t("monitor.alerts")} value={String(s.alerts_count)} />
              </div>
              {s.diagnosis && (
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {s.diagnosis}
                </p>
              )}
              {s.recommendation && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {s.recommendation}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  );
}
