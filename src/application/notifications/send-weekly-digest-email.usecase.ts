import type { EmailProvider } from "@/domain/notifications/email-provider";
import type { WeeklyDigest } from "@/domain/notifications/weekly-digest.types";
import type { Locale } from "@/domain/reports/report.types";

export type WeeklyDigestEmailData = {
  to: string;
  locale: Locale;
  digest: WeeklyDigest;
};

function formatRange(locale: Locale, start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
  const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-PE", opts);
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}

function subject(data: WeeklyDigestEmailData): string {
  return data.locale === "en"
    ? `Weekly posture digest — ${data.digest.orgName}`
    : `Resumen semanal de postura — ${data.digest.orgName}`;
}

function textBody(data: WeeklyDigestEmailData): string {
  const { digest, locale } = data;
  const range = formatRange(locale, digest.periodStart, digest.periodEnd);
  const lines =
    locale === "en"
      ? [
          `Weekly posture wellbeing digest for ${digest.orgName} (${range}).`,
          "",
          `Active employees: ${digest.activeEmployees}`,
          `Sessions: ${digest.totalSessions}`,
          `Average score: ${digest.avgScore}/100`,
          `Total alerts: ${digest.totalAlerts}`,
          "",
          digest.highRiskEmployees.length > 0
            ? "High-risk employees this week:"
            : "No employees flagged high-risk this week.",
          ...digest.highRiskEmployees.map(
            (e) => `  - ${e.name} (${e.department ?? "—"}): ${e.avgScore}/100, ${e.alerts} alerts`,
          ),
        ]
      : [
          `Resumen semanal de bienestar postural de ${digest.orgName} (${range}).`,
          "",
          `Colaboradores activos: ${digest.activeEmployees}`,
          `Sesiones: ${digest.totalSessions}`,
          `Puntaje promedio: ${digest.avgScore}/100`,
          `Alertas totales: ${digest.totalAlerts}`,
          "",
          digest.highRiskEmployees.length > 0
            ? "Colaboradores en riesgo alto esta semana:"
            : "Ningún colaborador en riesgo alto esta semana.",
          ...digest.highRiskEmployees.map(
            (e) => `  - ${e.name} (${e.department ?? "—"}): ${e.avgScore}/100, ${e.alerts} alertas`,
          ),
        ];
  return lines.join("\n");
}

function htmlBody(data: WeeklyDigestEmailData): string {
  const { digest, locale } = data;
  const range = formatRange(locale, digest.periodStart, digest.periodEnd);
  const title = locale === "en" ? "Weekly posture digest" : "Resumen semanal de postura";
  const kpis: Array<[string, string]> =
    locale === "en"
      ? [
          ["Active employees", String(digest.activeEmployees)],
          ["Sessions", String(digest.totalSessions)],
          ["Average score", `${digest.avgScore}/100`],
          ["Alerts", String(digest.totalAlerts)],
        ]
      : [
          ["Colaboradores activos", String(digest.activeEmployees)],
          ["Sesiones", String(digest.totalSessions)],
          ["Puntaje promedio", `${digest.avgScore}/100`],
          ["Alertas", String(digest.totalAlerts)],
        ];
  const kpiHtml = kpis
    .map(
      ([k, v]) => `
        <td style="padding:0 16px 0 0;">
          <div style="font-size:20px;font-weight:700;">${v}</div>
          <div style="font-size:11px;color:#8a90a0;text-transform:uppercase;">${k}</div>
        </td>`,
    )
    .join("");

  const riskHeading =
    digest.highRiskEmployees.length > 0
      ? locale === "en"
        ? "High-risk employees this week"
        : "Colaboradores en riesgo alto esta semana"
      : locale === "en"
        ? "No employees flagged high-risk this week."
        : "Ningún colaborador en riesgo alto esta semana.";

  const riskRows = digest.highRiskEmployees
    .map(
      (e) => `
        <tr>
          <td style="padding:4px 12px 4px 0;">${e.name}</td>
          <td style="padding:4px 12px 4px 0;color:#5b6270;">${e.department ?? "—"}</td>
          <td style="padding:4px 12px 4px 0;font-weight:600;color:#d14545;">${e.avgScore}/100</td>
          <td style="padding:4px 0;color:#5b6270;">${e.alerts} ${locale === "en" ? "alerts" : "alertas"}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2430;">
      <h1 style="font-size: 20px; margin-bottom: 2px;">${title}</h1>
      <p style="font-size: 13px; color: #8a90a0; margin-top: 0;">${digest.orgName} · ${range}</p>
      <table style="margin: 16px 0;"><tr>${kpiHtml}</tr></table>
      <p style="font-size: 13px; font-weight: 600; color: #1f2430; margin-top: 20px;">${riskHeading}</p>
      ${
        digest.highRiskEmployees.length > 0
          ? `<table style="font-size: 13px; border-collapse: collapse; width: 100%;">${riskRows}</table>`
          : ""
      }
    </div>
  `.trim();
}

/**
 * Caso de uso: arma y envía el correo del resumen semanal a un
 * administrador (owner/RR. HH.) de la organización. Mismo patrón que
 * `send-invite-email.usecase.ts` y `send-session-report-email.usecase.ts`.
 */
export async function sendWeeklyDigestEmail(
  provider: EmailProvider,
  data: WeeklyDigestEmailData,
): Promise<void> {
  await provider.send({
    to: data.to,
    subject: subject(data),
    html: htmlBody(data),
    text: textBody(data),
  });
}
