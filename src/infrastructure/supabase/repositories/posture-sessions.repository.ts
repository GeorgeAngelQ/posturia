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

/** Crea la fila de sesión al presionar "Iniciar" en el monitor. */
export async function startPostureSession(
  userId: string,
  startedAt: string,
): Promise<Pick<PostureSessionRow, "id" | "started_at">> {
  const { data, error } = await supabase
    .from("posture_sessions")
    .insert({ user_id: userId, started_at: startedAt })
    .select("id, started_at")
    .single();
  if (error) throw error;
  return data;
}

/** Completa la fila de sesión al presionar "Detener". */
export async function finishPostureSession(
  sessionId: string,
  patch: FinishPostureSessionPatch,
): Promise<void> {
  const { error } = await supabase.from("posture_sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

/** Sesiones ya finalizadas del usuario logueado (vista "Mis informes"). */
export async function listMyFinishedSessions(): Promise<PostureSessionRow[]> {
  const { data, error } = await supabase
    .from("posture_sessions")
    .select("*")
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Todas las sesiones finalizadas de la organización (panel de RR. HH.). */
export async function listAllFinishedSessions(): Promise<PostureSessionRow[]> {
  const { data, error } = await supabase
    .from("posture_sessions")
    .select("*")
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data;
}
