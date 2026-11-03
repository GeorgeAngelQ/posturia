import type { RunMode } from "@/domain/agents/agent.types";

export interface AgenticConfig {
  mode: Exclude<RunMode, "pipeline-fallback">;
  maxSupervisorSteps: number;
  maxSpecialistSteps: number;
  maxRevisions: number;
  callTimeoutMs: number;
  totalTimeoutMs: number;
  fallbackTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  temperature: number;
  maxTokens: number;
  ratePerMinute: number;
  ratePerDay: number;
}

export const DEFAULT_AGENTIC_CONFIG: AgenticConfig = {
  mode: "agentic",
  maxSupervisorSteps: 5,
  maxSpecialistSteps: 4,
  maxRevisions: 1,
  callTimeoutMs: 45_000,
  totalTimeoutMs: 120_000,
  fallbackTimeoutMs: 60_000,
  maxRetries: 2,
  retryBaseDelayMs: 500,
  temperature: 0.2,
  maxTokens: 700,
  ratePerMinute: 6,
  ratePerDay: 100,
};

function num(value: string | undefined, fallback: number, min = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value.trim() !== "" && n >= min
    ? n
    : fallback;
}

export function configFromEnv(env: Record<string, string | undefined>): AgenticConfig {
  const d = DEFAULT_AGENTIC_CONFIG;
  return {
    mode:
      (env["AGENT_MODE"] ?? "agentic").trim().toLowerCase() === "pipeline" ? "pipeline" : "agentic",
    maxSupervisorSteps: Math.floor(num(env["AGENT_MAX_SUPERVISOR_STEPS"], d.maxSupervisorSteps, 2)),
    maxSpecialistSteps: Math.floor(num(env["AGENT_MAX_SPECIALIST_STEPS"], d.maxSpecialistSteps, 1)),
    maxRevisions: Math.floor(num(env["AGENT_MAX_REVISIONS"], d.maxRevisions, 0)),
    callTimeoutMs: num(env["AGENT_CALL_TIMEOUT_MS"], d.callTimeoutMs, 1000),
    totalTimeoutMs: num(env["AGENT_TOTAL_TIMEOUT_MS"], d.totalTimeoutMs, 5000),
    fallbackTimeoutMs: num(env["AGENT_FALLBACK_TIMEOUT_MS"], d.fallbackTimeoutMs, 1000),
    maxRetries: Math.floor(num(env["AGENT_MAX_RETRIES"], d.maxRetries, 0)),
    retryBaseDelayMs: d.retryBaseDelayMs,
    temperature: num(env["AGENT_TEMPERATURE"], d.temperature, 0),
    maxTokens: Math.floor(num(env["AGENT_MAX_TOKENS"], d.maxTokens, 50)),
    ratePerMinute: Math.floor(num(env["AGENT_RATE_PER_MIN"], d.ratePerMinute, 1)),
    ratePerDay: Math.floor(num(env["AGENT_RATE_PER_DAY"], d.ratePerDay, 1)),
  };
}
