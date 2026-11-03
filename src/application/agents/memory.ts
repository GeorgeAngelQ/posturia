import type { AlertBreakdown, PostureIssue, UserPostureMemory } from "@/domain/agents/agent.types";
import { NECK_LIMIT, TORSO_LIMIT } from "@/domain/posture/posture";
import type { PostureSessionMetrics } from "@/domain/reports/report.types";

const MAX_SCORES = 10;
const MAX_ADVICE = 8;

export function emptyMemory(nowIso: string): UserPostureMemory {
  return {
    version: 1,
    sessionsAnalyzed: 0,
    recurringIssues: { forward_head: 0, torso_slouch: 0 },
    recentScores: [],
    adviceGiven: [],
    lastEscalationAt: null,
    lastSummary: "",
    updatedAt: nowIso,
  };
}

export function detectIssues(
  metrics: PostureSessionMetrics,
  alerts: AlertBreakdown | null,
): PostureIssue[] {
  const issues: PostureIssue[] = [];
  if (metrics.avgNeckAngle > NECK_LIMIT || (alerts?.forwardHead ?? 0) > 0)
    issues.push("forward_head");
  if (metrics.avgTorsoAngle > TORSO_LIMIT || (alerts?.torsoSlouch ?? 0) > 0)
    issues.push("torso_slouch");
  return issues;
}

export function extractAdviceTitles(recommendation: string): string[] {
  return recommendation
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*\d+[.)]\s*(.+)$/)?.[1])
    .filter((x): x is string => Boolean(x))
    .map((x) =>
      x
        .split(/\s+/)
        .slice(0, 7)
        .join(" ")
        .replace(/[.,;:]+$/, ""),
    );
}

function firstSentence(text: string, max = 200): string {
  const s = text.replace(/\s+/g, " ").trim();
  const cut = s.search(/[.!?]\s/);
  const sentence = cut > 0 ? s.slice(0, cut + 1) : s;
  return sentence.length > max ? `${sentence.slice(0, max)}…` : sentence;
}

/** Actualiza la memoria de forma determinista (sin LLM): barata, reproducible y auditable. */
export function updateMemory(
  prev: UserPostureMemory | null,
  metrics: PostureSessionMetrics,
  alerts: AlertBreakdown | null,
  outcome: { diagnosis: string; recommendation: string; escalate: boolean },
  nowIso: string,
): UserPostureMemory {
  const base = prev ?? emptyMemory(nowIso);
  const recurring = { ...base.recurringIssues };
  for (const issue of detectIssues(metrics, alerts)) recurring[issue] += 1;

  const advice = [...base.adviceGiven, ...extractAdviceTitles(outcome.recommendation)];
  const uniqueAdvice = advice.filter(
    (a, i) => advice.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i,
  );

  return {
    version: 1,
    sessionsAnalyzed: base.sessionsAnalyzed + 1,
    recurringIssues: recurring,
    recentScores: [...base.recentScores, Math.round(metrics.score)].slice(-MAX_SCORES),
    adviceGiven: uniqueAdvice.slice(-MAX_ADVICE),
    lastEscalationAt: outcome.escalate ? nowIso : base.lastEscalationAt,
    lastSummary: firstSentence(outcome.diagnosis),
    updatedAt: nowIso,
  };
}
