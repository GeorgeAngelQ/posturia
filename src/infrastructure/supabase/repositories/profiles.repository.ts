import { supabase } from "@/infrastructure/supabase/client";
import type { Database } from "@/infrastructure/supabase/types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileSummary = Pick<ProfileRow, "full_name" | "email">;

export async function getProfileSummary(userId: string): Promise<ProfileSummary | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
