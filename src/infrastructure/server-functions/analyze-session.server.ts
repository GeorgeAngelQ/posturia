import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/infrastructure/supabase/auth-middleware";
import { z } from "zod";
import type { AgenticDiagnosisResult } from "@/domain/agents/agent.types";
import { configFromEnv } from "@/application/agents/config";
import { RateLimitedError, runAgenticDiagnosis } from "@/application/agents/orchestrator";
import { getAIProvider } from "@/infrastructure/ai/ai-provider.factory";
import {
  createSupabaseMemoryStore,
  createSupabaseTraceStore,
  createSupabaseUserData,
  resolveOrgScope,
} from "@/infrastructure/agents/supabase-agent-gateways";

const Input = z.object({
  locale: z.enum(["es", "en"]),
  durationSeconds: z.number(),
  goodPosturePct: z.number(),
  avgNeckAngle: z.number(),
  avgTorsoAngle: z.number(),
  alertsCount: z.number(),
  score: z.number(),
  department: z.string().optional(),
  sessionId: z.string().uuid().optional(),
});

export type AnalyzeSessionResult = AgenticDiagnosisResult & { rateLimited: boolean };

function emptyResult(rateLimited: boolean): AnalyzeSessionResult {
  return {
    diagnosis: "",
    recommendation: "",
    escalate: false,
    escalationReason: "",
    runId: null,
    mode: "agentic",
    validationPassed: false,
    validationIssues: [],
    agentsUsed: [],
    llmCalls: 0,
    toolCalls: 0,
    durationMs: 0,
    rateLimited,
  };
}

export const analyzeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<AnalyzeSessionResult> => {
    const { supabase, userId } = context;
    const { sessionId, ...metrics } = data;

    const orgId = await resolveOrgScope(supabase, userId, sessionId ?? null);
    if (!orgId) throw new Error("No se pudo determinar la organización del usuario");

    try {
      const result = await runAgenticDiagnosis(
        {
          provider: getAIProvider(),
          data: createSupabaseUserData(supabase),
          memory: createSupabaseMemoryStore(supabase),
          traceStore: createSupabaseTraceStore(supabase),
          config: configFromEnv(process.env),
        },
        { userId, orgId, sessionId: sessionId ?? null, metrics },
      );
      return { ...result, rateLimited: false };
    } catch (error) {
      if (error instanceof RateLimitedError) return emptyResult(true);
      throw error;
    }
  });
