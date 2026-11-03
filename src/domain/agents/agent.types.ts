import type { PostureSessionMetrics } from "@/domain/reports/report.types";

export type AgentName = "orchestrator" | "supervisor" | "analyst" | "coach" | "validator";

export type StepKind = "llm" | "tool" | "delegate" | "validation" | "memory" | "system";

export type RunMode = "agentic" | "pipeline" | "pipeline-fallback";

export type PostureIssue = "forward_head" | "torso_slouch";

export interface TraceStep {
  idx: number;
  agent: AgentName;
  kind: StepKind;
  name?: string | undefined;
  depth: number;
  ok: boolean;
  input: unknown;
  output: unknown;
  error?: string | undefined;
  durationMs: number;
  at: string;
}

export interface AgentToolDef {
  name: string;
  description: string;
  argsExample: string;
  kind?: "tool" | "delegate";
  run(args: unknown): Promise<unknown>;
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  durationSeconds: number;
  goodPosturePct: number;
  avgNeckAngle: number;
  avgTorsoAngle: number;
  alertsCount: number;
  score: number;
}

export interface AlertBreakdown {
  forwardHead: number;
  torsoSlouch: number;
  high: number;
  medium: number;
}

export interface UserPostureMemory {
  version: 1;
  sessionsAnalyzed: number;
  recurringIssues: Record<PostureIssue, number>;
  recentScores: number[];
  adviceGiven: string[];
  lastEscalationAt: string | null;
  lastSummary: string;
  updatedAt: string;
}

export interface RunStart {
  orgId: string;
  userId: string;
  sessionId: string | null;
  mode: RunMode;
  provider: string;
  model: string | null;
  input: unknown;
}

export interface RunFinish {
  status: "ok" | "fallback" | "error";
  mode: RunMode;
  output: unknown;
  error?: string | undefined;
  llmCalls: number;
  toolCalls: number;
  approxTokensIn: number;
  approxTokensOut: number;
  validationPassed: boolean | null;
  escalated: boolean;
  durationMs: number;
}

export interface UserDataGateway {
  getRecentSessions(
    userId: string,
    limit: number,
    excludeSessionId?: string,
  ): Promise<SessionSummary[]>;
  getAlertBreakdown(sessionId: string): Promise<AlertBreakdown>;
}

export interface MemoryStore {
  load(userId: string, orgId: string): Promise<UserPostureMemory | null>;
  save(userId: string, orgId: string, memory: UserPostureMemory): Promise<void>;
}

export interface TraceStore {
  countRuns(userId: string, sinceIso: string): Promise<number>;
  startRun(run: RunStart): Promise<string | null>;
  finishRun(runId: string, summary: RunFinish, steps: TraceStep[]): Promise<void>;
}

export interface AgenticInput {
  userId: string;
  orgId: string;
  sessionId: string | null;
  metrics: PostureSessionMetrics;
}

export interface AgenticDiagnosisResult {
  diagnosis: string;
  recommendation: string;
  escalate: boolean;
  escalationReason: string;
  runId: string | null;
  mode: RunMode;
  validationPassed: boolean;
  validationIssues: string[];
  agentsUsed: AgentName[];
  llmCalls: number;
  toolCalls: number;
  durationMs: number;
}
