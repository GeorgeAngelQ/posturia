import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/infrastructure/supabase/cron-auth";
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
 * Ruta de API basada en archivo (`/api/weekly-digest`), NO una `createServerFn`.
 *
 * Esta función es invocada por un scheduler externo —no por la app desde el
 * navegador—, así que necesita una URL estable e independiente de cualquier
 * import desde un componente de React. Una `createServerFn` solo se incluye
 * en el build cuando el bundler la encuentra al recorrer el grafo de módulos
 * alcanzable desde las entradas (rutas de cliente/servidor); como ninguna
 * vista/componente llamaba a `sendWeeklyDigestFn`, esa función quedaba fuera
 * del build de producción (`.output/`) aunque compilara bien con `tsc`. Una
 * ruta de archivo, en cambio, se registra desde el árbol de rutas mismo
 * (`routeTree.gen.ts`), que SIEMPRE es parte del grafo de entrada — por eso
 * queda garantizado que termine en el build con una URL fija.
 *
 * Protegida por el mismo secreto de cron (`LOVABLE_CRON_SECRET`), validado
 * aquí directamente (en vez de vía middleware de `createServerFn`, que es
 * solo para ese tipo de función) con la misma comparación en tiempo
 * constante de `cron-auth.ts`.
 *
 * Cómo programarla: ver "Resumen semanal por correo" en el README — mismo
 * header `Authorization: Bearer <LOVABLE_CRON_SECRET>`, apuntando ahora a
 * `POST /api/weekly-digest` en vez de al nombre de la server function.
 */
async function runWeeklyDigest(request: Request): Promise<Response> {
  // Vercel Cron envía `Authorization: Bearer $CRON_SECRET` (nombre fijo de
  // Vercel). Si solo está definido ese, se usa como secreto del cron, así en
  // Vercel basta con configurar `CRON_SECRET`.
  if (!process.env["LOVABLE_CRON_SECRET"] && process.env["CRON_SECRET"]) {
    process.env["LOVABLE_CRON_SECRET"] = process.env["CRON_SECRET"];
  }
  const rejected = await authenticateCronRequest(request);
  if (rejected) return rejected;

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
          console.error(`[WeeklyDigest] Falló el envío a ${recipient.email} (org ${org.id}):`, err);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      orgErrors.push({ orgId: org.id, orgName: org.name, error: message });
      console.error(`[WeeklyDigest] Falló la organización ${org.id} (${org.name}):`, err);
    }
  }

  return Response.json({
    organizations: organizations.length,
    emailsSent,
    emailsFailed,
    orgErrors,
    provider: provider.name,
  });
}

/**
 * `POST` para schedulers genéricos (cron del sistema, GitHub Actions, Render
 * Cron Job) y `GET` porque Vercel Cron solo invoca con GET. Ambos exigen
 * `Authorization: Bearer <LOVABLE_CRON_SECRET>`. En Vercel basta con definir
 * `CRON_SECRET` (Vercel lo envía solo en cada invocación del cron y esta ruta
 * lo acepta como alias de `LOVABLE_CRON_SECRET`).
 */
export const Route = createFileRoute("/api/weekly-digest")({
  server: {
    handlers: {
      POST: ({ request }) => runWeeklyDigest(request),
      GET: ({ request }) => runWeeklyDigest(request),
    },
  },
});
