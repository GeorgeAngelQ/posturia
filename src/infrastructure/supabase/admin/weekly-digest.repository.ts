import { supabaseAdmin } from "@/infrastructure/supabase/client.server";
import type {
  DigestMemberInput,
  DigestSessionInput,
} from "@/application/notifications/build-weekly-digest.usecase";

export type ActiveOrganization = { id: string; name: string };

/**
 * Consultas de infraestructura para el resumen semanal, con el cliente de
 * service role (`supabaseAdmin`) — el job de cron no tiene un usuario
 * autenticado detrás, así que no hay JWT con el que la RLS pueda evaluar
 * `is_org_member`/`has_org_admin_access`. Esto es intencional (un job de
 * mantenimiento de confianza, no una request de un usuario) y por eso vive
 * en su propia carpeta `admin/`, separado de los `repositories/` normales
 * que SIEMPRE pasan por RLS con el cliente del usuario.
 *
 * Importa `client.server.ts`: solo se usa desde server functions/rutas de
 * servidor (nunca desde código que termine en el bundle del cliente).
 */
export async function listActiveOrganizations(): Promise<ActiveOrganization[]> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("is_active", true);
  if (error) throw error;
  return data ?? [];
}

/** Correo de owner/RR. HH. de la organización — destinatarios del resumen. */
export async function listOrgAdminRecipients(
  orgId: string,
): Promise<Array<{ email: string; fullName: string; locale: string }>> {
  const { data: members, error: membersError } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .in("role", ["owner", "hr"]);
  if (membersError) throw membersError;
  if (!members || members.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name, locale")
    .in(
      "id",
      members.map((m) => m.user_id),
    );
  if (profilesError) throw profilesError;

  return (profiles ?? [])
    .filter((p) => Boolean(p.email))
    .map((p) => ({ email: p.email, fullName: p.full_name ?? "", locale: p.locale }));
}

/** Miembros de la organización (nombre + departamento), para nombrar a cada empleado en el resumen. */
export async function listOrgMembersForDigest(orgId: string): Promise<DigestMemberInput[]> {
  const { data: members, error: membersError } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, departments(name)")
    .eq("org_id", orgId);
  if (membersError) throw membersError;
  if (!members || members.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      members.map((m) => m.user_id),
    );
  if (profilesError) throw profilesError;
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return members.map((m) => {
    const profile = profileById.get(m.user_id);
    return {
      userId: m.user_id,
      name: profile?.full_name || profile?.email || m.user_id.slice(0, 8),
      department: m.departments?.name ?? null,
    };
  });
}

/** Sesiones finalizadas de la organización desde `sinceIso` (inclusive), para el período del resumen. */
export async function listFinishedSessionsSince(
  orgId: string,
  sinceIso: string,
): Promise<DigestSessionInput[]> {
  const { data, error } = await supabaseAdmin
    .from("posture_sessions")
    .select("user_id, score, alerts_count")
    .eq("org_id", orgId)
    .not("ended_at", "is", null)
    .gte("started_at", sinceIso);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    userId: s.user_id,
    score: s.score,
    alertsCount: s.alerts_count,
  }));
}
