import { z } from "zod";
import type { AIProvider } from "@/domain/ai/ai-provider";
import type {
  AgentName,
  AgentToolDef,
  AgenticDiagnosisResult,
  AgenticInput,
  MemoryStore,
  RunMode,
  TraceStore,
  UserDataGateway,
  UserPostureMemory,
} from "@/domain/agents/agent.types";
import type { PostureSessionMetrics } from "@/domain/reports/report.types";
import { diagnosePostureSession } from "@/application/ai/diagnose-posture-session.usecase";
import { runAgentLoop } from "./agent-loop";
import type { AgenticConfig } from "./config";
import { extractJson } from "./json-protocol";
import { LlmClient } from "./llm-client";
import { detectIssues, updateMemory } from "./memory";
import {
  analystSystem,
  coachSystem,
  languageName,
  summarizeMetrics,
  supervisorSystem,
  validatorSystem,
} from "./prompts";
import { withTimeout } from "./resilience";
import { TraceCollector } from "./trace-collector";
import { buildDataTools, type ToolContext } from "./tools";
import {
  buildSafeFallback,
  sanitizeText,
  validateOutputs,
  type ValidationIssue,
} from "./validators";

export class RateLimitedError extends Error {
  constructor(public readonly scope: "minute" | "day") {
    super(`Límite de análisis por ${scope === "minute" ? "minuto" : "día"} alcanzado`);
    this.name = "RateLimitedError";
  }
}

export interface AgenticDeps {
  provider: AIProvider;
  data: UserDataGateway;
  memory: MemoryStore;
  traceStore: TraceStore;
  config: AgenticConfig;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const TextOutput = z
  .string()
  .transform((s) => sanitizeText(s))
  .pipe(z.string().min(20));
const SupervisorOutput = z.object({
  escalate: z.boolean(),
  escalation_reason: z.string().default(""),
});
const DelegateArgs = z.object({ task: z.string().min(3).max(600) });
const ValidatorVerdict = z.object({
  verdict: z.enum(["pass", "revise"]),
  issues: z
    .array(z.object({ target: z.enum(["diagnosis", "recommendation"]), problem: z.string() }))
    .default([]),
});

async function bestEffort<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(
      "[agents] operación auxiliar falló:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function enforceRateLimit(deps: AgenticDeps, userId: string, nowMs: number): Promise<void> {
  const minute = await bestEffort(() =>
    deps.traceStore.countRuns(userId, new Date(nowMs - 60_000).toISOString()),
  );
  if (minute !== null && minute >= deps.config.ratePerMinute) throw new RateLimitedError("minute");
  const day = await bestEffort(() =>
    deps.traceStore.countRuns(userId, new Date(nowMs - 24 * 3_600_000).toISOString()),
  );
  if (day !== null && day >= deps.config.ratePerDay) throw new RateLimitedError("day");
}

export async function runAgenticDiagnosis(
  deps: AgenticDeps,
  input: AgenticInput,
): Promise<AgenticDiagnosisResult> {
  const now = deps.now ?? Date.now;
  const startedMs = now();
  await enforceRateLimit(deps, input.userId, startedMs);

  const trace = new TraceCollector(now);
  const configuredMode: RunMode = deps.config.mode;
  const runId = await bestEffort(() =>
    deps.traceStore.startRun({
      orgId: input.orgId,
      userId: input.userId,
      sessionId: input.sessionId,
      mode: configuredMode,
      provider: deps.provider.name,
      model: deps.provider.model ?? null,
      input: { metrics: input.metrics },
    }),
  );

  const finish = async (
    status: "ok" | "fallback" | "error",
    mode: RunMode,
    result: CoreResult | null,
    error?: string,
  ) => {
    const stats = trace.stats();
    const durationMs = now() - startedMs;
    if (runId) {
      await bestEffort(() =>
        deps.traceStore.finishRun(
          runId,
          {
            status,
            mode,
            output: result
              ? {
                  diagnosis: result.diagnosis,
                  recommendation: result.recommendation,
                  escalate: result.escalate,
                  validationIssues: result.validationIssues,
                }
              : null,
            error,
            llmCalls: stats.llmCalls,
            toolCalls: stats.toolCalls,
            approxTokensIn: stats.approxTokensIn,
            approxTokensOut: stats.approxTokensOut,
            validationPassed: result ? result.validationPassed : null,
            escalated: result?.escalate ?? false,
            durationMs,
          },
          trace.list(),
        ),
      );
    }
    const agentsUsed = [
      ...new Set(
        trace
          .list()
          .map((s) => s.agent)
          .filter((a): a is AgentName => a !== "orchestrator"),
      ),
    ];
    return { llmCalls: stats.llmCalls, toolCalls: stats.toolCalls, durationMs, agentsUsed };
  };

  if (configuredMode === "pipeline") {
    const r = await runPipeline(deps, input.metrics, trace);
    const meta = await finish("ok", "pipeline", r);
    return { ...r, ...meta, runId, mode: "pipeline" };
  }

  try {
    const r = await runAgentic(deps, input, trace);
    const meta = await finish("ok", "agentic", r);
    return { ...r, ...meta, runId, mode: "agentic" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trace.add({
      agent: "orchestrator",
      kind: "system",
      name: "agentic_failed_using_pipeline_fallback",
      depth: 0,
      ok: false,
      input: null,
      output: null,
      error: message,
      durationMs: 0,
    });
    try {
      const r = await runPipeline(deps, input.metrics, trace);
      const meta = await finish("fallback", "pipeline-fallback", r);
      return { ...r, ...meta, runId, mode: "pipeline-fallback" };
    } catch (error2) {
      await finish(
        "error",
        "pipeline-fallback",
        null,
        error2 instanceof Error ? error2.message : String(error2),
      );
      throw error2;
    }
  }
}

type CoreResult = Omit<
  AgenticDiagnosisResult,
  "runId" | "llmCalls" | "toolCalls" | "durationMs" | "agentsUsed" | "mode"
>;

async function runPipeline(
  deps: AgenticDeps,
  metrics: PostureSessionMetrics,
  trace: TraceCollector,
): Promise<CoreResult> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const out = await withTimeout(
    () => diagnosePostureSession(deps.provider, metrics),
    deps.config.fallbackTimeoutMs,
    "pipeline",
  );
  trace.add({
    agent: "orchestrator",
    kind: "system",
    name: "pipeline_analyst_then_coach",
    depth: 0,
    ok: true,
    input: { metrics },
    output: out,
    durationMs: now() - startedAt,
  });
  let diagnosis = sanitizeText(out.diagnosis);
  let recommendation = sanitizeText(out.recommendation);
  const issues = validateOutputs({ diagnosis, recommendation }, metrics);
  const hardFields = new Set(issues.filter((i) => i.hard).map((i) => i.field));
  if (hardFields.size > 0) {
    const safe = buildSafeFallback(metrics);
    if (hardFields.has("diagnosis")) diagnosis = safe.diagnosis;
    if (hardFields.has("recommendation")) recommendation = safe.recommendation;
  }
  trace.add({
    agent: "orchestrator",
    kind: "validation",
    name: "deterministic_rules",
    depth: 0,
    ok: issues.length === 0,
    input: null,
    output: { issues },
    durationMs: 0,
  });
  return {
    diagnosis,
    recommendation,
    escalate: metrics.score < 40,
    escalationReason:
      metrics.score < 40
        ? metrics.locale === "en"
          ? "Very low ergonomic score."
          : "Puntaje ergonómico muy bajo."
        : "",
    validationPassed: issues.length === 0,
    validationIssues: issues.map((i) => i.message),
  };
}

async function runAgentic(
  deps: AgenticDeps,
  input: AgenticInput,
  trace: TraceCollector,
): Promise<CoreResult> {
  const { config, provider } = deps;
  const now = deps.now ?? Date.now;
  const { metrics } = input;
  const lang = languageName(metrics.locale);

  const llm = new LlmClient(
    provider,
    {
      callTimeoutMs: config.callTimeoutMs,
      maxRetries: config.maxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      deadlineAt: now() + config.totalTimeoutMs,
    },
    trace,
    { now, ...(deps.sleep ? { sleep: deps.sleep } : {}) },
  );

  const memory: UserPostureMemory | null = await bestEffort(() =>
    deps.memory.load(input.userId, input.orgId),
  );
  const alerts = input.sessionId
    ? await bestEffort(() => deps.data.getAlertBreakdown(input.sessionId!))
    : null;
  trace.add({
    agent: "orchestrator",
    kind: "memory",
    name: "load_context",
    depth: 0,
    ok: true,
    input: { userId: "(redacted)", sessionId: input.sessionId },
    output: { memory, alerts },
    durationMs: 0,
  });

  const ctx: ToolContext = {
    userId: input.userId,
    sessionId: input.sessionId,
    metrics,
    memory,
    data: deps.data,
  };
  const tools = buildDataTools(ctx);
  const results = { analyst: null as string | null, coach: null as string | null };
  const metricsText = summarizeMetrics(metrics);

  const analystTools = [
    tools.checkThresholds,
    tools.getAlertBreakdown,
    tools.computeTrend,
    tools.getUserHistory,
  ];
  const coachTools = [tools.lookupExercises, tools.recallMemory, tools.checkThresholds];

  const runAnalyst = async (task: string): Promise<string> => {
    const r = await runAgentLoop({
      agent: "analyst",
      depth: 1,
      system: analystSystem(lang, analystTools),
      goal: `Measured session data:\n${metricsText}\n\nSupervisor task: ${task}`,
      tools: analystTools,
      llm,
      trace,
      maxSteps: config.maxSpecialistSteps,
      parseFinal: (o) => TextOutput.parse(o),
      now,
    });
    results.analyst = r.final;
    return r.final;
  };

  const runCoach = async (task: string): Promise<string> => {
    const r = await runAgentLoop({
      agent: "coach",
      depth: 1,
      system: coachSystem(lang, coachTools),
      goal: `Measured session data:\n${metricsText}\n\nAnalyst diagnosis:\n${results.analyst ?? "(not available yet)"}\n\nSupervisor task: ${task}`,
      tools: coachTools,
      llm,
      trace,
      maxSteps: config.maxSpecialistSteps,
      parseFinal: (o) => TextOutput.parse(o),
      now,
    });
    results.coach = r.final;
    return r.final;
  };

  const delegateAnalyst: AgentToolDef = {
    name: "delegate_analyst",
    kind: "delegate",
    description:
      "Ask the Biomechanical Analyst to write the diagnosis. Returns the diagnosis text.",
    argsExample: '{"task":"Diagnose; focus on forward head, user shows a worsening trend"}',
    async run(args) {
      return { diagnosis: await runAnalyst(DelegateArgs.parse(args).task) };
    },
  };
  const delegateCoach: AgentToolDef = {
    name: "delegate_coach",
    kind: "delegate",
    description: "Ask the Ergonomics Coach to write the personalized plan. Returns the plan text.",
    argsExample: '{"task":"4 actions focused on monitor height; avoid repeating past advice"}',
    async run(args) {
      return { plan: await runCoach(DelegateArgs.parse(args).task) };
    },
  };

  const supervisorTools = [
    delegateAnalyst,
    delegateCoach,
    tools.recallMemory,
    tools.checkThresholds,
  ];
  const supervisorSystemPrompt = supervisorSystem(lang, supervisorTools);

  const sup = await runAgentLoop({
    agent: "supervisor",
    depth: 0,
    system: supervisorSystemPrompt,
    goal: `New finished session to report on.\n${metricsText}`,
    tools: supervisorTools,
    llm,
    trace,
    maxSteps: config.maxSupervisorSteps,
    parseFinal: (o) => SupervisorOutput.parse(o),
    now,
  });
  let escalate = sup.final.escalate;
  let escalationReason = sup.final.escalation_reason;
  let supMessages = sup.messages;

  if (!results.analyst) {
    trace.add({
      agent: "orchestrator",
      kind: "system",
      name: "enforce_analyst_not_delegated",
      depth: 0,
      ok: true,
      input: null,
      output: "Supervisor did not delegate to the analyst",
      durationMs: 0,
    });
    await runAnalyst("Diagnose this session.");
  }
  if (!results.coach) {
    trace.add({
      agent: "orchestrator",
      kind: "system",
      name: "enforce_coach_not_delegated",
      depth: 0,
      ok: true,
      input: null,
      output: "Supervisor did not delegate to the coach",
      durationMs: 0,
    });
    await runCoach("Write the personalized plan.");
  }

  let issues: ValidationIssue[] = [];
  let revisions = 0;
  let llmReviewed = false;
  let pendingReviewerIssues: ValidationIssue[] = [];
  const everFlagged: ValidationIssue[] = [];
  for (;;) {
    const current = { diagnosis: results.analyst ?? "", recommendation: results.coach ?? "" };
    const deterministic = validateOutputs(current, metrics);
    let llmIssues: ValidationIssue[] = [];
    if (!llmReviewed) {
      llmReviewed = true;
      llmIssues = await reviewWithValidator(llm, trace, lang, metricsText, current);
      pendingReviewerIssues = llmIssues;
    }
    issues = [...deterministic, ...llmIssues];
    everFlagged.push(...issues);
    trace.add({
      agent: "validator",
      kind: "validation",
      name: revisions === 0 ? "first_review" : `review_after_revision_${revisions}`,
      depth: 0,
      ok: issues.length === 0,
      input: null,
      output: { issues },
      durationMs: 0,
    });
    if (issues.length === 0 || revisions >= config.maxRevisions) break;

    revisions += 1;
    const cont = await runAgentLoop({
      agent: "supervisor",
      depth: 0,
      system: supervisorSystemPrompt,
      seedMessages: supMessages,
      goal: `OBSERVATION from validator: ${JSON.stringify(
        issues.map((i) => ({ target: i.field, problem: i.message })),
      )}. Re-delegate to the responsible specialist with precise corrections, then finish.`,
      tools: supervisorTools,
      llm,
      trace,
      maxSteps: 4,
      parseFinal: (o) => SupervisorOutput.parse(o),
      now,
    }).catch((e) => {
      trace.add({
        agent: "orchestrator",
        kind: "system",
        name: "revision_failed",
        depth: 0,
        ok: false,
        input: null,
        output: null,
        error: e instanceof Error ? e.message : String(e),
        durationMs: 0,
      });
      return null;
    });
    if (!cont) break;
    pendingReviewerIssues = [];
    supMessages = cont.messages;
    escalate = escalate || cont.final.escalate;
    if (cont.final.escalation_reason) escalationReason = cont.final.escalation_reason;
  }

  let diagnosis = results.analyst ?? "";
  let recommendation = results.coach ?? "";
  const finalIssues = validateOutputs({ diagnosis, recommendation }, metrics);
  const hardFields = new Set(finalIssues.filter((i) => i.hard).map((i) => i.field));
  if (hardFields.size > 0) {
    const safe = buildSafeFallback(metrics);
    if (hardFields.has("diagnosis")) diagnosis = safe.diagnosis;
    if (hardFields.has("recommendation")) recommendation = safe.recommendation;
    trace.add({
      agent: "orchestrator",
      kind: "system",
      name: "safe_template_applied",
      depth: 0,
      ok: true,
      input: { fields: [...hardFields] },
      output: "Unsafe or unusable agent output replaced by deterministic template",
      durationMs: 0,
    });
  }
  const validationPassed = finalIssues.length === 0 && pendingReviewerIssues.length === 0;

  const recurring = Math.max(
    memory?.recurringIssues.forward_head ?? 0,
    memory?.recurringIssues.torso_slouch ?? 0,
  );
  const ruleEscalate = metrics.score < 40 || (recurring >= 3 && metrics.score < 60);
  if (ruleEscalate && !escalate) {
    escalate = true;
    escalationReason ||=
      metrics.locale === "en"
        ? "Low score with a recurring postural issue."
        : "Puntaje bajo con un problema postural recurrente.";
    trace.add({
      agent: "orchestrator",
      kind: "system",
      name: "escalation_rule_applied",
      depth: 0,
      ok: true,
      input: { score: metrics.score, recurring },
      output: "escalate=true",
      durationMs: 0,
    });
  }

  const nextMemory = updateMemory(
    memory,
    metrics,
    alerts,
    { diagnosis, recommendation, escalate },
    new Date(now()).toISOString(),
  );
  const saved = await bestEffort(() => deps.memory.save(input.userId, input.orgId, nextMemory));
  trace.add({
    agent: "orchestrator",
    kind: "memory",
    name: "save_memory",
    depth: 0,
    ok: saved !== null,
    input: { issuesDetected: detectIssues(metrics, alerts) },
    output: nextMemory,
    durationMs: 0,
  });

  return {
    diagnosis,
    recommendation,
    escalate,
    escalationReason: escalate ? escalationReason : "",
    validationPassed,
    validationIssues: [...new Set([...everFlagged, ...finalIssues].map((i) => i.message))],
  };
}

async function reviewWithValidator(
  llm: LlmClient,
  trace: TraceCollector,
  lang: string,
  metricsText: string,
  out: { diagnosis: string; recommendation: string },
): Promise<ValidationIssue[]> {
  try {
    const raw = await llm.complete("validator", 0, [
      { role: "system", content: validatorSystem(lang) },
      {
        role: "user",
        content: `Measured data:\n${metricsText}\n\nDiagnosis:\n${out.diagnosis}\n\nRecommendation:\n${out.recommendation}`,
      },
    ]);
    const verdict = ValidatorVerdict.parse(extractJson(raw));
    if (verdict.verdict === "pass") return [];
    return verdict.issues.map((i) => ({
      field: i.target,
      code: "inconsistent" as const,
      message: `validator: ${i.problem}`,
      hard: false,
    }));
  } catch (error) {
    trace.add({
      agent: "validator",
      kind: "system",
      name: "validator_skipped",
      depth: 0,
      ok: false,
      input: null,
      output: null,
      error: error instanceof Error ? error.message : String(error),
      durationMs: 0,
    });
    return [];
  }
}
