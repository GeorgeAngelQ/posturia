import { supabase } from "@/infrastructure/supabase/client";

export type PostureAlertInsert = {
  session_id: string;
  user_id: string;
  alert_type: "forward_head" | "torso_slouch";
  severity: "medium" | "high";
  neck_angle: number;
  torso_angle: number;
};

export function recordPostureAlert(payload: PostureAlertInsert): void {
  void supabase.from("posture_alerts").insert(payload);
}
