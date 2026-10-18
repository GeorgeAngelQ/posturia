import { riskLevel } from "@/domain/posture/posture";
import type {
  WeeklyDigest,
  WeeklyDigestEmployee,
} from "@/domain/notifications/weekly-digest.types";

/** Una sesión finalizada, ya reducida a lo que necesita el resumen. */
export type DigestSessionInput = {
  userId: string;
  score: number;
  alertsCount: number;
};

/** Un miembro de la organización, ya reducido a lo que necesita el resumen. */
export type DigestMemberInput = {
  userId: string;
  name: string;
  department: string | null;
};

export type BuildWeeklyDigestInput = {
  orgName: string;
  periodStart: string;
  periodEnd: string;
  sessions: DigestSessionInput[];
  members: DigestMemberInput[];
};

const MAX_HIGH_RISK_ROWS = 5;

/**
 * Caso de uso puro: agrega las sesiones de los últimos 7 días por empleado
 * y por departamento, y arma el resumen semanal que recibe owner/RR. HH.
 * No toca Supabase ni nada de red — eso lo resuelve quien llama (el server
 * function del cron), igual que `diagnosePostureSession` no sabe de Ollama.
 */
export function buildWeeklyDigest(input: BuildWeeklyDigestInput): WeeklyDigest {
  const memberByUserId = new Map(input.members.map((m) => [m.userId, m]));

  const byUser = new Map<string, { scoreSum: number; count: number; alerts: number }>();
  for (const session of input.sessions) {
    const acc = byUser.get(session.userId) ?? { scoreSum: 0, count: 0, alerts: 0 };
    acc.scoreSum += session.score;
    acc.count += 1;
    acc.alerts += session.alertsCount;
    byUser.set(session.userId, acc);
  }

  const employees: WeeklyDigestEmployee[] = Array.from(byUser.entries()).map(([userId, acc]) => {
    const member = memberByUserId.get(userId);
    const avgScore = acc.count > 0 ? Math.round(acc.scoreSum / acc.count) : 0;
    return {
      userId,
      name: member?.name || userId.slice(0, 8),
      department: member?.department ?? null,
      sessions: acc.count,
      avgScore,
      alerts: acc.alerts,
      risk: riskLevel(avgScore),
    };
  });

  const totalSessions = input.sessions.length;
  const totalAlerts = input.sessions.reduce((sum, s) => sum + s.alertsCount, 0);
  const avgScore =
    totalSessions > 0
      ? Math.round(input.sessions.reduce((sum, s) => sum + s.score, 0) / totalSessions)
      : 0;

  const highRiskEmployees = employees
    .filter((e) => e.risk === "high")
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, MAX_HIGH_RISK_ROWS);

  const deptAcc = new Map<string, { scoreSum: number; sessions: number }>();
  employees.forEach((e) => {
    const dept = e.department || "—";
    const acc = deptAcc.get(dept) ?? { scoreSum: 0, sessions: 0 };
    acc.scoreSum += e.avgScore * e.sessions;
    acc.sessions += e.sessions;
    deptAcc.set(dept, acc);
  });
  const byDepartment = Array.from(deptAcc.entries())
    .map(([department, acc]) => ({
      department,
      avgScore: acc.sessions > 0 ? Math.round(acc.scoreSum / acc.sessions) : 0,
      sessions: acc.sessions,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);

  return {
    orgName: input.orgName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    totalSessions,
    activeEmployees: byUser.size,
    avgScore,
    totalAlerts,
    highRiskEmployees,
    byDepartment,
  };
}
