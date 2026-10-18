import { createServerFn } from "@tanstack/react-start";
import { requireCronAuth } from "@/infrastructure/supabase/cron-middleware";
import { getEmailProvider } from "@/infrastructure/notifications/email-provider.factory";
import { sendWeeklyDigestEmail } from "@/application/notifications/send-weekly-digest-email.usecase";
import { buildWeeklyDigest } from "@/application/notifications/build-weekly-digest.usecase";
import {
  listActiveOrganizations,
  listFinishedSessionsSince,
  listOrgAdminRecipients,
  listOrgMembersForDigest,
} from "@/infrastructure/supabase/admin/weekly-digest.repository";
import type { Locale } from "@/domain/reports/report.types";

const DIGEST_PERIOD_DAYS = 7;

function toLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "es";
}

/**
 * Server function invocada por un scheduler — NO por la app desde el
 * navegador — una vez por semana: arma y envía el resumen de bienestar
 * postural (sesiones, puntaje promedio, alertas, colaboradores en riesgo
 * alto) a cada owner/RR. HH. de cada organización activa.
 *
 * Protegida por `requireCronAuth` (secreto compartido), no por sesión de
 * usuario — por eso usa `supabaseAdmin` (service role) en vez del cliente
 * con RLS: no hay un usuario autenticado detrás de un cron.
 *
 * Cómo programarla:
 *   - Lovable Cloud: panel "Scheduled Functions" → crea un cron semanal
 *     (p. ej. lunes 8:00) apuntando a esta función.
 *   - Self-hosted: cualquier scheduler (cron del sistema, GitHub Actions,
 *     etc.) que haga `POST` al endpoint de esta función con el header
 *     `Authorization: Bearer <LOVABLE_CRON_SECRET>` — ver README.
 *
 * "Mejor esfuerzo" por organización y por destinatario: si una organización
 * o un envío puntual falla, se registra y se continúa con el resto — un
 * fallo aislado no debe impedir que las demás organizaciones reciban su
 * resumen.
 */
export const sendWeeklyDigestFn = createServerFn({ method: "POST" })
  .middleware([requireCronAuth])
  .handler(async () => {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - DIGEST_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const organizations = await listActiveOrganizations();
    const provider = getEmailProvider();

    let emailsSent = 0;
    let emailsFailed = 0;
    const orgErrors: Array<{ orgId: string; orgName: string; error: string }> = [];

    for (const org of organizations) {
      try {
        const [sessions, members, recipients] = await Promise.all([
          listFinishedSessionsSince(org.id, periodStart.toISOString()),
          listOrgMembersForDigest(org.id),
          listOrgAdminRecipients(org.id),
        ]);

        if (recipients.length === 0) continue;

        const digest = buildWeeklyDigest({
          orgName: org.name,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          sessions,
          members,
        });

        for (const recipient of recipients) {
          try {
            await sendWeeklyDigestEmail(provider, {
              to: recipient.email,
              locale: toLocale(recipient.locale),
              digest,
            });
            emailsSent += 1;
          } catch (err) {
            emailsFailed += 1;
            console.error(
              `[WeeklyDigest] Falló el envío a ${recipient.email} (org ${org.id}):`,
              err,
            );
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        orgErrors.push({ orgId: org.id, orgName: org.name, error: message });
        console.error(`[WeeklyDigest] Falló la organización ${org.id} (${org.name}):`, err);
      }
    }

    return {
      organizations: organizations.length,
      emailsSent,
      emailsFailed,
      orgErrors,
      provider: provider.name,
    };
  });
