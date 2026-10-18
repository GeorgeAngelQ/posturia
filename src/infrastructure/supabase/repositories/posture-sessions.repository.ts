import { supabase } from "@/infrastructure/supabase/client";
import type { Database } from "@/infrastructure/supabase/types";

export type PostureSessionRow = Database["public"]["Tables"]["posture_sessions"]["Row"];

export type FinishPostureSessionPatch = {
  ended_at: string;
  duration_seconds: number;
  samples: number;
  good_posture_pct: number;
  avg_neck_angle: number;
  avg_torso_angle: number;
  score: number;
  alerts_count: number;
  diagnosis: string;
  recommendation: string;
};

export async function startPostureSession(
  userId: string,
  orgId: string,
  startedAt: string,
): Promise<Pick<PostureSessionRow, "id" | "started_at">> {
  const { data, error } = await supabase
    .from("posture_sessions")
    .insert({ user_id: userId, org_id: orgId, started_at: startedAt })
    .select("id, started_at")
    .single();
  if (error) throw error;
  return data;
}

export async function finishPostureSession(
  sessionId: string,
  patch: FinishPostureSessionPatch,
): Promise<void> {
  const { error } = await supabase.from("posture_sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

export async function listMyFinishedSessions(userId: string): Promise<PostureSessionRow[]> {
  const { data, error } = await supabase
    .from("posture_sessions")
    .select("*")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAllFinishedSessions(orgId: string): Promise<PostureSessionRow[]> {
  const { data, error } = await supabase
    .from("posture_sessions")
    .select("*")
    .eq("org_id", orgId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data;
}
