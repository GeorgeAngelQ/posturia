import type { EmailAttachment, EmailProvider } from "@/domain/notifications/email-provider";
import type { Locale, PostureReportData } from "@/domain/reports/report.types";
import { formatDuration, riskLevel } from "@/domain/posture/posture";

export type SessionReportEmailData = {
  to: string;
  locale: Locale;
  report: PostureReportData;
};

const riskLabels: Record<Locale, Record<ReturnType<typeof riskLevel>, string>> = {
  es: { low: "bajo", mid: "medio", high: "alto" },
  en: { low: "low", mid: "medium", high: "high" },
};

function subject(data: SessionReportEmailData): string {
  const date = new Date(data.report.startedAt).toLocaleDateString();
  return data.locale === "en"
    ? `Your PosturaIA report — ${date}`
    : `Tu informe de PosturaIA — ${date}`;
}

function textBody(data: SessionReportEmailData): string {
  const { report, locale } = data;
  const risk = riskLabels[locale][riskLevel(report.score)];
  if (locale === "en") {
    return [
      `Here is the report for your posture session on ${new Date(report.startedAt).toLocaleString()}.`,
      "",
      `Score: ${report.score}/100 (${risk} risk)`,
      `Duration: ${formatDuration(report.durationSeconds)} (mm:ss)`,
      `Good posture: ${report.goodPosturePct.toFixed(1)}%`,
      `Average neck angle: ${report.avgNeckAngle.toFixed(1)}°`,
      `Average torso angle: ${report.avgTorsoAngle.toFixed(1)}°`,
      `Alerts: ${report.alertsCount}`,
      "",
      "Full diagnosis and recommendation attached as PDF.",
    ].join("\n");
  }
  return [
    `Este es el informe de tu sesión de postura del ${new Date(report.startedAt).toLocaleString()}.`,
    "",
    `Puntaje: ${report.score}/100 (riesgo ${risk})`,
    `Duración: ${formatDuration(report.durationSeconds)} (mm:ss)`,
    `Postura correcta: ${report.goodPosturePct.toFixed(1)}%`,
    `Ángulo cervical promedio: ${report.avgNeckAngle.toFixed(1)}°`,
    `Ángulo torácico promedio: ${report.avgTorsoAngle.toFixed(1)}°`,
    `Alertas: ${report.alertsCount}`,
    "",
    "Diagnóstico y recomendación completos, adjuntos en PDF.",
  ].join("\n");
}

function htmlBody(data: SessionReportEmailData): string {
  const { report, locale } = data;
  const risk = riskLabels[locale][riskLevel(report.score)];
  const title = locale === "en" ? "Your posture report" : "Tu informe de postura";
  const riskColor = { low: "#16a37a", mid: "#c99a1f", high: "#d14545" }[riskLevel(report.score)];
  const rows: Array<[string, string]> =
    locale === "en"
      ? [
          ["Duration", `${formatDuration(report.durationSeconds)} (mm:ss)`],
          ["Good posture", `${report.goodPosturePct.toFixed(1)}%`],
          ["Neck angle", `${report.avgNeckAngle.toFixed(1)}°`],
          ["Torso angle", `${report.avgTorsoAngle.toFixed(1)}°`],
          ["Alerts", String(report.alertsCount)],
        ]
      : [
          ["Duración", `${formatDuration(report.durationSeconds)} (mm:ss)`],
          ["Postura correcta", `${report.goodPosturePct.toFixed(1)}%`],
          ["Ángulo cervical", `${report.avgNeckAngle.toFixed(1)}°`],
          ["Ángulo torácico", `${report.avgTorsoAngle.toFixed(1)}°`],
          ["Alertas", String(report.alertsCount)],
        ];

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#5b6270;">${k}</td><td style="padding:4px 0;font-weight:600;">${v}</td></tr>`,
    )
    .join("");

  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2430;">
      <h1 style="font-size: 20px; margin-bottom: 4px;">${title}</h1>
      <p style="font-size: 13px; color: #8a90a0; margin-top: 0;">
        ${new Date(report.startedAt).toLocaleString()}
      </p>
      <p style="margin: 16px 0;">
        <span style="font-size: 32px; font-weight: 700;">${report.score}</span>
        <span style="color:#8a90a0;">/100</span>
        <span style="background:${riskColor};color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;margin-left:8px;">
          ${locale === "en" ? "risk" : "riesgo"}: ${risk}
        </span>
      </p>
      <table style="font-size: 14px; border-collapse: collapse;">${rowsHtml}</table>
      <p style="font-size: 13px; color: #5b6270; margin-top: 20px;">
        ${locale === "en" ? "Full diagnosis and recommendation attached as PDF." : "Diagnóstico y recomendación completos, adjuntos en PDF."}
      </p>
    </div>
  `.trim();
}

/**
 * Caso de uso: arma y envía el correo con el informe de una sesión de
 * postura, con el PDF ya generado como adjunto (lo arma el server function
 * que llama a esto, vía `buildReportPdf` — infraestructura, no este
 * archivo). Mismo patrón que `send-invite-email.usecase.ts`.
 */
export async function sendSessionReportEmail(
  provider: EmailProvider,
  data: SessionReportEmailData,
  attachment: EmailAttachment,
): Promise<void> {
  await provider.send({
    to: data.to,
    subject: subject(data),
    html: htmlBody(data),
    text: textBody(data),
    attachments: [attachment],
  });
}
