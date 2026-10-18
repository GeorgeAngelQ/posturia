import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/infrastructure/supabase/auth-middleware";
import { sendSessionReportEmail } from "@/application/notifications/send-session-report-email.usecase";
import { getEmailProvider } from "@/infrastructure/notifications/email-provider.factory";
import { buildReportPdf } from "@/infrastructure/pdf/report-pdf.adapter";
import { reportPdfLabels } from "@/infrastructure/pdf/report-pdf-labels";

const Input = z.object({
  locale: z.enum(["es", "en"]),
  department: z.string(),
  startedAt: z.string(),
  durationSeconds: z.number(),
  goodPosturePct: z.number(),
  avgNeckAngle: z.number(),
  avgTorsoAngle: z.number(),
  alertsCount: z.number(),
  score: z.number(),
  diagnosis: z.string(),
  recommendation: z.string(),
});

/** Convierte el PDF (ArrayBuffer) a base64 sin depender de `Buffer`, para que funcione igual en Node que en un runtime tipo Workers. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Server function (adaptador HTTP): exige auth y resuelve el nombre/correo
 * del destinatario DESDE EL SERVIDOR (perfil del usuario autenticado, vía
 * RLS), nunca desde el input del cliente — así nadie puede hacer que este
 * endpoint le mande un correo con datos fabricados a un tercero. Solo las
 * métricas de la sesión (ya calculadas en el cliente al cerrarla) vienen en
 * el input.
 *
 * Genera el mismo PDF que el botón "Descargar" (`buildReportPdf`, compartido
 * con la UI) y lo adjunta al correo. Si falla, el informe sigue disponible
 * para descargar manualmente — este envío es "mejor esfuerzo", no bloquea
 * el flujo de la sesión.
 */
export const sendSessionReportEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    if (error || !profile?.email) {
      throw new Error("No se pudo resolver el correo del usuario autenticado.");
    }

    const report = {
      employeeName: profile.full_name ?? "",
      email: profile.email,
      department: data.department,
      startedAt: data.startedAt,
      durationSeconds: data.durationSeconds,
      goodPosturePct: data.goodPosturePct,
      avgNeckAngle: data.avgNeckAngle,
      avgTorsoAngle: data.avgTorsoAngle,
      alertsCount: data.alertsCount,
      score: data.score,
      diagnosis: data.diagnosis,
      recommendation: data.recommendation,
    };

    const doc = buildReportPdf(report, reportPdfLabels(data.locale));
    const contentBase64 = arrayBufferToBase64(doc.output("arraybuffer") as ArrayBuffer);

    const provider = getEmailProvider();
    await sendSessionReportEmail(
      provider,
      { to: profile.email, locale: data.locale, report },
      {
        filename: `posturaia-${data.startedAt.slice(0, 10)}.pdf`,
        contentBase64,
        contentType: "application/pdf",
      },
    );

    return { delivered: provider.name !== "console", provider: provider.name };
  });
