import { supabase } from "@/infrastructure/supabase/client";
import { loose } from "@/infrastructure/supabase/loose-client";

export type AgentRunRow = {
  id: string;
  org_id: string;
  user_id: string;
  session_id: string | null;
  mode: "agentic" | "pipeline" | "pipeline-fallback";
  status: "running" | "ok" | "fallback" | "error";
  provider: string | null;
  model: string | null;
  input: unknown;
  output: unknown;
  error: string | null;
  llm_calls: number;
  tool_calls: number;
  approx_tokens_in: number;
  approx_tokens_out: number;
  validation_passed: boolean | null;
  escalated: boolean;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
};

export type AgentStepRow = {
  id: number;
  run_id: string;
  idx: number;
  agent: "orchestrator" | "supervisor" | "analyst" | "coach" | "validator";
  kind: "llm" | "tool" | "delegate" | "validation" | "memory" | "system";
  name: string | null;
  depth: number;
  ok: boolean;
  input: unknown;
  output: unknown;
  error: string | null;
  duration_ms: number;
  created_at: string;
};

/** Ejecuciones visibles para el usuario (RLS: las propias; owner/hr también las de la org si está en modo individual). */
export async function listAgentRuns(limit = 50): Promise<AgentRunRow[]> {
  const { data, error } = await loose(supabase)
    .from("agent_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AgentRunRow[];
}

export async function listAgentSteps(runId: string): Promise<AgentStepRow[]> {
  const { data, error } = await loose(supabase)
    .from("agent_steps")
    .select("*")
    .eq("run_id", runId)
    .order("idx", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AgentStepRow[];
}
