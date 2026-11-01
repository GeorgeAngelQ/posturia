import { riskLevel, type RiskLevel } from "@/domain/posture/posture";
import {
  avg,
  csvCell,
  startOfDay,
  type SessionLike,
} from "@/application/reports/reports-analytics";

export type HrRange = "week" | "month" | "quarter";

export type HrSession = SessionLike & {
  user_id: string;
  diagnosis?: string | null;
  recommendation?: string | null;
};

export type HrMember = {
  userId: string;
  fullName: string;
  email: string;
  departmentName: string | null;
};

export type EmployeeRow = {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  sessions: number;
  totalSeconds: number;
  alerts: number;
  score: number;
  risk: RiskLevel;
  lastStartedAt: string;
  lastNeck: number;
  lastTorso: number;
  lastDiagnosis: string;
  lastRecommendation: string;
};

export type DepartmentRow = {
  name: string | null;
  score: number;
  monitored: number;
  total: number;
};

export type ScoreBand = "excellent" | "good" | "moderate" | "attention";

export type TrendPoint = { date: Date; current: number | null; previous: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export const HR_RANGE_DAYS: Record<HrRange, number> = { week: 7, month: 30, quarter: 90 };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function hrBounds(
  range: HrRange,
  now: Date,
): { from: Date; to: Date; prevFrom: Date; days: number } {
  const days = HR_RANGE_DAYS[range];
  const to = new Date(startOfDay(now).getTime() + DAY_MS);
  const from = new Date(to.getTime() - days * DAY_MS);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  return { from, to, prevFrom, days };
}

export function inWindow<T extends SessionLike>(sessions: T[], from: Date, to: Date): T[] {
  const a = from.getTime();
  const b = to.getTime();
  return sessions.filter((s) => {
    const t = new Date(s.started_at).getTime();
    return t >= a && t < b;
  });
}

export function employeeRows(sessions: HrSession[], members: HrMember[]): EmployeeRow[] {
  const memberById = new Map(members.map((m) => [m.userId, m]));
  const byUser = new Map<string, HrSession[]>();
  for (const s of sessions) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const rows: EmployeeRow[] = [];
  for (const [userId, own] of byUser) {
    const last = own.reduce((a, b) =>
      new Date(b.started_at).getTime() > new Date(a.started_at).getTime() ? b : a,
    );
    const m = memberById.get(userId);
    const score = round1(avg(own.map((s) => s.score)));
    rows.push({
      userId,
      name: m?.fullName || m?.email || userId.slice(0, 8),
      email: m?.email ?? "",
      department: m?.departmentName ?? null,
      sessions: own.length,
      totalSeconds: own.reduce((a, s) => a + s.duration_seconds, 0),
      alerts: own.reduce((a, s) => a + s.alerts_count, 0),
      score,
      risk: riskLevel(score),
      lastStartedAt: last.started_at,
      lastNeck: Number(last.avg_neck_angle),
      lastTorso: Number(last.avg_torso_angle),
      lastDiagnosis: last.diagnosis ?? "",
      lastRecommendation: last.recommendation ?? "",
    });
  }
  return rows.sort((a, b) => a.score - b.score);
}

export function departmentRows(rows: EmployeeRow[], members: HrMember[]): DepartmentRow[] {
  const totals = new Map<string | null, number>();
  for (const m of members) {
    const k = m.departmentName ?? null;
    totals.set(k, (totals.get(k) ?? 0) + 1);
  }
  const groups = new Map<string | null, EmployeeRow[]>();
  for (const r of rows) groups.set(r.department, [...(groups.get(r.department) ?? []), r]);

  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      score: Math.round(avg(list.map((r) => r.score))),
      monitored: list.length,
      total: Math.max(totals.get(name) ?? 0, list.length),
    }))
    .sort((a, b) => b.score - a.score);
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return "excellent";
  if (score >= 75) return "good";
  if (score >= 65) return "moderate";
  return "attention";
}
export function trendSeries(sessions: SessionLike[], range: HrRange, now: Date): TrendPoint[] {
  const { from, days, prevFrom } = hrBounds(range, now);
  const bucketDays = range === "quarter" ? 7 : 1;
  const bucketMs = bucketDays * DAY_MS;
  const n = Math.ceil(days / bucketDays);

  const bucketAvg = (start: number, end: number): number | null => {
    const vals = sessions
      .filter((s) => {
        const t = new Date(s.started_at).getTime();
        return t >= start && t < end;
      })
      .map((s) => s.score);
    return vals.length ? Math.round(avg(vals)) : null;
  };

  return Array.from({ length: n }, (_, i) => {
    const start = from.getTime() + i * bucketMs;
    const prevStart = prevFrom.getTime() + i * bucketMs;
    return {
      date: new Date(start),
      current: bucketAvg(start, start + bucketMs),
      previous: bucketAvg(prevStart, prevStart + bucketMs),
    };
  });
}

export function employeesToCsv(rows: EmployeeRow[]): string {
  const header = [
    "name",
    "email",
    "department",
    "sessions",
    "hours",
    "alerts",
    "avg_score",
    "risk",
    "last_session",
    "last_neck_angle",
    "last_torso_angle",
  ];
  const lines = rows.map((r) =>
    [
      r.name,
      r.email,
      r.department ?? "",
      r.sessions,
      (r.totalSeconds / 3600).toFixed(2),
      r.alerts,
      r.score.toFixed(1),
      r.risk,
      r.lastStartedAt,
      r.lastNeck.toFixed(1),
      r.lastTorso.toFixed(1),
    ]
      .map(csvCell)
      .join(","),
  );
  return "\uFEFF" + [header.join(","), ...lines].join("\r\n");
}
