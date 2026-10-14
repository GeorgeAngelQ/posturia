import { supabase } from "@/infrastructure/supabase/client";
import type { Database } from "@/infrastructure/supabase/types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileSummary = Pick<ProfileRow, "full_name" | "email" | "department">;

/** Datos de encabezado (nombre/email/depto) para el informe PDF de un usuario. */
export async function getProfileSummary(userId: string): Promise<ProfileSummary | null> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email, department")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

/** Todos los perfiles (panel de RR. HH., para cruzar con las sesiones). */
export async function listAllProfiles(): Promise<
  Array<Pick<ProfileRow, "id" | "full_name" | "email" | "department">>
> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, department");
  if (error) throw error;
  return data;
}
