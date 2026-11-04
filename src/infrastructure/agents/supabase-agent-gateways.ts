import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AlertBreakdown,
  MemoryStore,
  RunFinish,
  RunStart,
  SessionSummary,
  TraceStep,
  TraceStore,
  UserDataGateway,
  UserPostureMemory,
} from "@/domain/agents/agent.types";
import type { Database } from "@/infrastructure/supabase/types";
import { loose } from "@/infrastructure/supabase/loose-client";

export function createSupabaseUserData(client: SupabaseClient<Database>): UserDataGateway {
  return {
    async getRecentSessions(userId, limit, excludeSessionId): Promise<SessionSummary[]> {
      let q = client
        .from("posture_sessions")
        .select(
          "id, started_at, duration_seconds, good_posture_pct, avg_neck_angle, avg_torso_angle, alerts_count, score",
        )
        .eq("user_id", userId)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (excludeSessionId) q = q.neq("id", excludeSessionId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        startedAt: r.started_at,
        durationSeconds: r.duration_seconds,
        goodPosturePct: Number(r.good_posture_pct),
        avgNeckAngle: Number(r.avg_neck_angle),
        avgTorsoAngle: Number(r.avg_torso_angle),
        alertsCount: r.alerts_count,
        score: r.score,
      }));
    },

    async getAlertBreakdown(sessionId): Promise<AlertBreakdown> {
      const { data, error } = await client
        .from("posture_alerts")
        .select("alert_type, severity")
        .eq("session_id", sessionId);
      if (error) throw error;
      const b: AlertBreakdown = { forwardHead: 0, torsoSlouch: 0, high: 0, medium: 0 };
      for (const a of data ?? []) {
        if (a.alert_type === "forward_head") b.forwardHead += 1;
        if (a.alert_type === "torso_slouch") b.torsoSlouch += 1;
        if (a.severity === "high") b.high += 1;
        if (a.severity === "medium") b.medium += 1;
      }
      return b;
    },
  };
}

export function createSupabaseMemoryStore(client: SupabaseClient<Database>): MemoryStore {
  const db = loose(client);
  return {
    async load(userId, orgId) {
      const { data, error } = await db
        .from("agent_memory")
        .select("memory")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data?.memory as UserPostureMemory | undefined) ?? null;
    },
    async save(userId, orgId, memory) {
      const { error } = await db
        .from("agent_memory")
        .upsert({ user_id: userId, org_id: orgId, memory, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}

export function createSupabaseTraceStore(client: SupabaseClient<Database>): TraceStore {
  const db = loose(client);
  return {
    async countRuns(userId, sinceIso) {
      const { count, error } = await db
        .from("agent_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("started_at", sinceIso);
      if (error) throw error;
      return count ?? 0;
    },

    async startRun(run: RunStart) {
      const { data, error } = await db
        .from("agent_runs")
        .insert({
          org_id: run.orgId,
          user_id: run.userId,
          session_id: run.sessionId,
          mode: run.mode,
          status: "running",
          provider: run.provider,
          model: run.model,
          input: run.input,
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },

    async finishRun(runId: string, s: RunFinish, steps: TraceStep[]) {
      const { error } = await db
        .from("agent_runs")
        .update({
          status: s.status,
          mode: s.mode,
          output: s.output,
          error: s.error ?? null,
          llm_calls: s.llmCalls,
          tool_calls: s.toolCalls,
          approx_tokens_in: s.approxTokensIn,
          approx_tokens_out: s.approxTokensOut,
          validation_passed: s.validationPassed,
          escalated: s.escalated,
          duration_ms: s.durationMs,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
      if (error) throw error;

      if (steps.length > 0) {
        const rows = steps.map((st) => ({
          run_id: runId,
          idx: st.idx,
          agent: st.agent,
          kind: st.kind,
          name: st.name ?? null,
          depth: st.depth,
          ok: st.ok,
          input: st.input,
          output: st.output,
          error: st.error ?? null,
          duration_ms: Math.max(0, Math.round(st.durationMs)),
          created_at: st.at,
        }));
        const { error: stepsError } = await db.from("agent_steps").insert(rows);
        if (stepsError) throw stepsError;
      }
    },
  };
}

export async function resolveOrgScope(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string | null,
): Promise<string | null> {
  if (sessionId) {
    const { data, error } = await client
      .from("posture_sessions")
      .select("org_id, user_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw error;
    if (data && data.user_id === userId) return data.org_id;
    return null;
  }
  const { data, error } = await client.rpc("my_organizations");
  if (error) throw error;
  return data?.[0]?.org_id ?? null;
}
