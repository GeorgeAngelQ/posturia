import { z } from "zod";
import type {
  AgentToolDef,
  PostureIssue,
  SessionSummary,
  UserDataGateway,
  UserPostureMemory,
} from "@/domain/agents/agent.types";
import { NECK_LIMIT, TORSO_LIMIT, riskLevel } from "@/domain/posture/posture";
import type { PostureSessionMetrics } from "@/domain/reports/report.types";
import { detectIssues } from "./memory";
import { lookupKb } from "./knowledge/ergonomics-kb";

export interface ToolContext {
  userId: string;
  sessionId: string | null;
  metrics: PostureSessionMetrics;
  memory: UserPostureMemory | null;
  data: UserDataGateway;
}

const round = (n: number, d = 1) => Number(n.toFixed(d));

function summarizeSession(s: SessionSummary) {
  return {
    date: s.startedAt.slice(0, 10),
    minutes: Math.round(s.durationSeconds / 60),
    goodPosturePct: round(s.goodPosturePct),
    avgNeck: round(s.avgNeckAngle),
    avgTorso: round(s.avgTorsoAngle),
    alerts: s.alertsCount,
    score: s.score,
  };
}

export function computeTrend(currentScore: number, previous: SessionSummary[]) {
  if (previous.length === 0) {
    return { available: false as const, reason: "no previous sessions" };
  }
  const avgPrev = previous.reduce((a, s) => a + s.score, 0) / previous.length;
  const delta = round(currentScore - avgPrev);
  const direction = delta >= 5 ? "improving" : delta <= -5 ? "worsening" : "stable";
  return {
    available: true as const,
    previousSessions: previous.length,
    averagePreviousScore: round(avgPrev),
    currentScore,
    delta,
    direction,
  };
}

export function buildDataTools(ctx: ToolContext) {
  const { metrics } = ctx;

  const getSessionMetrics: AgentToolDef = {
    name: "get_session_metrics",
    description:
      "Measured metrics of the session being analyzed (duration, % good posture, angles, alerts, score).",
    argsExample: "{}",
    async run() {
      return {
        durationMinutes: Math.round(metrics.durationSeconds / 60),
        goodPosturePct: round(metrics.goodPosturePct),
        avgNeckAngle: round(metrics.avgNeckAngle),
        avgTorsoAngle: round(metrics.avgTorsoAngle),
        sustainedAlerts: metrics.alertsCount,
        score: metrics.score,
        department: metrics.department ?? null,
      };
    },
  };

  const checkThresholds: AgentToolDef = {
    name: "check_thresholds",
    description:
      "Deterministic comparison of the session against the healthy reference values; returns detected deviations and risk level. Prefer this over doing the math yourself.",
    argsExample: "{}",
    async run() {
      const issues = detectIssues(metrics, null);
      return {
        neck: {
          value: round(metrics.avgNeckAngle),
          limit: NECK_LIMIT,
          excess: round(Math.max(0, metrics.avgNeckAngle - NECK_LIMIT)),
          withinLimit: metrics.avgNeckAngle <= NECK_LIMIT,
        },
        torso: {
          value: round(metrics.avgTorsoAngle),
          limit: TORSO_LIMIT,
          excess: round(Math.max(0, metrics.avgTorsoAngle - TORSO_LIMIT)),
          withinLimit: metrics.avgTorsoAngle <= TORSO_LIMIT,
        },
        deviations: issues,
        riskLevel: riskLevel(metrics.score),
        score: metrics.score,
      };
    },
  };

  const HistoryArgs = z.object({ limit: z.number().int().min(1).max(10).optional() });
  const getUserHistory: AgentToolDef = {
    name: "get_user_history",
    description: "The user's most recent finished sessions before this one (newest first).",
    argsExample: '{"limit":5}',
    async run(args) {
      const { limit = 5 } = HistoryArgs.parse(args);
      const rows = await ctx.data.getRecentSessions(ctx.userId, limit, ctx.sessionId ?? undefined);
      return { count: rows.length, sessions: rows.map(summarizeSession) };
    },
  };

  const getAlertBreakdown: AgentToolDef = {
    name: "get_alert_breakdown",
    description:
      "Counts of the alerts recorded during this session by type (forward head / torso slouch) and severity.",
    argsExample: "{}",
    async run() {
      if (!ctx.sessionId) return { available: false, reason: "session id not provided" };
      const b = await ctx.data.getAlertBreakdown(ctx.sessionId);
      return { available: true, ...b };
    },
  };

  const computeTrendTool: AgentToolDef = {
    name: "compute_trend",
    description:
      "Compares this session's score with the average of the user's previous sessions (improving / stable / worsening).",
    argsExample: "{}",
    async run() {
      const prev = await ctx.data.getRecentSessions(ctx.userId, 8, ctx.sessionId ?? undefined);
      return computeTrend(metrics.score, prev);
    },
  };

  const recallMemory: AgentToolDef = {
    name: "recall_memory",
    description:
      "Long-term memory about this user: how many sessions were analyzed, recurring issues, recent scores and advice already given (avoid repeating it).",
    argsExample: "{}",
    async run() {
      const m = ctx.memory;
      if (!m) return { empty: true, note: "first analyzed session for this user" };
      return {
        empty: false,
        sessionsAnalyzed: m.sessionsAnalyzed,
        recurringIssues: m.recurringIssues,
        recentScores: m.recentScores,
        adviceAlreadyGiven: m.adviceGiven,
        lastEscalationAt: m.lastEscalationAt,
        lastSummary: m.lastSummary,
      };
    },
  };

  const ExerciseArgs = z.object({ issue: z.enum(["forward_head", "torso_slouch", "general"]) });
  const lookupExercises: AgentToolDef = {
    name: "lookup_exercises",
    description:
      "Curated ergonomics library: exercises and workstation adjustments for an issue. Use it instead of inventing exercises.",
    argsExample: '{"issue":"forward_head"}',
    async run(args) {
      const { issue } = ExerciseArgs.parse(args);
      return {
        issue: issue satisfies PostureIssue | "general",
        entries: lookupKb(issue, metrics.locale),
      };
    },
  };

  return {
    getSessionMetrics,
    checkThresholds,
    getUserHistory,
    getAlertBreakdown,
    computeTrend: computeTrendTool,
    recallMemory,
    lookupExercises,
  };
}
