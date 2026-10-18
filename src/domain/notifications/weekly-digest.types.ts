import type { RiskLevel } from "@/domain/posture/posture";

/** Una fila de empleado ya agregada para el resumen semanal. */
export type WeeklyDigestEmployee = {
  userId: string;
  name: string;
  department: string | null;
  sessions: number;
  avgScore: number;
  alerts: number;
  risk: RiskLevel;
};

export type WeeklyDigestDepartment = {
  department: string;
  avgScore: number;
  sessions: number;
};

/**
 * Resumen semanal de bienestar postural de una organización: lo que recibe
 * owner/RR. HH. por correo cada semana. No sabe nada de Supabase, email ni
 * HTTP — es el "vocabulario" que comparten `build-weekly-digest.usecase.ts`
 * (lo arma) y `send-weekly-digest-email.usecase.ts` (lo convierte en correo).
 */
export type WeeklyDigest = {
  orgName: string;
  periodStart: string;
  periodEnd: string;
  totalSessions: number;
  activeEmployees: number;
  avgScore: number;
  totalAlerts: number;
  /** Empleados en riesgo "alto" esta semana, peor puntaje primero, máximo 5. */
  highRiskEmployees: WeeklyDigestEmployee[];
  byDepartment: WeeklyDigestDepartment[];
};
