import { riskLevel, type RiskLevel } from "@/domain/posture/posture";

export type SessionLike = {
  id: string;
  started_at: string;
  duration_seconds: number;
  good_posture_pct: number | string;
  avg_neck_angle: number | string;
  avg_torso_angle: number | string;
  alerts_count: number;
  score: number;
};

export type RangeKey = "7d" | "month" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function rangeBounds(range: RangeKey, now: Date): { from: Date | null; to: Date } {
  const to = new Date(startOfDay(now).getTime() + DAY_MS);
  if (range === "7d") return { from: new Date(to.getTime() - 7 * DAY_MS), to };
  if (range === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
  return { from: null, to };
}

export function previousBounds(range: RangeKey, now: Date): { from: Date; to: Date } | null {
  const cur = rangeBounds(range, now);
  if (!cur.from) return null;
  if (range === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: cur.from };
  }
  const len = cur.to.getTime() - cur.from.getTime();
  return { from: new Date(cur.from.getTime() - len), to: cur.from };
}

export function filterByBounds<T extends SessionLike>(
  sessions: T[],
  from: Date | null,
  to: Date,
): T[] {
  return sessions.filter((s) => {
    const t = new Date(s.started_at).getTime();
    return (from === null || t >= from.getTime()) && t < to.getTime();
  });
}

export function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, v) => a + v, 0) / values.length;
}

export function avgScore(sessions: SessionLike[]): number {
  return avg(sessions.map((s) => s.score));
}

export function chronologicalScores(sessions: SessionLike[]): number[] {
  return [...sessions]
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
    .map((s) => s.score);
}

export function currentStreak(sessions: SessionLike[], now: Date): number {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.started_at))));
  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

export function weekActivity(
  sessions: SessionLike[],
  now: Date,
): Array<{ key: string; active: boolean; isToday: boolean; future: boolean }> {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.started_at))));
  const today = startOfDay(now);
  const offset = (today.getDay() + 6) % 7; // lunes = 0
  const monday = new Date(today.getTime() - offset * DAY_MS);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * DAY_MS);
    const key = dayKey(d);
    return {
      key,
      active: days.has(key),
      isToday: key === dayKey(today),
      future: d.getTime() > today.getTime(),
    };
  });
}

export function dailyAverages(
  sessions: SessionLike[],
  now: Date,
  days = 7,
): Array<{ date: Date; score: number | null }> {
  const today = startOfDay(now);
  const buckets = new Map<string, number[]>();
  for (const s of sessions) {
    const k = dayKey(new Date(s.started_at));
    buckets.set(k, [...(buckets.get(k) ?? []), s.score]);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today.getTime() - (days - 1 - i) * DAY_MS);
    const vals = buckets.get(dayKey(date));
    return { date, score: vals ? Math.round(avg(vals)) : null };
  });
}

export function hourlyAverages(
  sessions: SessionLike[],
): Array<{ hour: number; score: number; count: number; risk: RiskLevel }> {
  const buckets = new Map<number, number[]>();
  for (const s of sessions) {
    const h = new Date(s.started_at).getHours();
    buckets.set(h, [...(buckets.get(h) ?? []), s.score]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, vals]) => {
      const score = Math.round(avg(vals));
      return { hour, score, count: vals.length, risk: riskLevel(score) };
    });
}

export function peakRiskHour(
  hourly: Array<{ hour: number; score: number; risk: RiskLevel }>,
): { hour: number; score: number; risk: RiskLevel } | null {
  if (hourly.length === 0) return null;
  return hourly.reduce((min, h) => (h.score < min.score ? h : min));
}

export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type CsvSession = SessionLike & {
  diagnosis?: string | null;
  recommendation?: string | null;
};

export function sessionsToCsv(sessions: CsvSession[]): string {
  const header = [
    "started_at",
    "duration_seconds",
    "score",
    "good_posture_pct",
    "avg_neck_angle",
    "avg_torso_angle",
    "alerts_count",
    "diagnosis",
    "recommendation",
  ];
  const rows = sessions.map((s) =>
    [
      s.started_at,
      s.duration_seconds,
      s.score,
      Number(s.good_posture_pct).toFixed(1),
      Number(s.avg_neck_angle).toFixed(1),
      Number(s.avg_torso_angle).toFixed(1),
      s.alerts_count,
      s.diagnosis ?? "",
      s.recommendation ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [header.join(","), ...rows].join("\r\n");
}
