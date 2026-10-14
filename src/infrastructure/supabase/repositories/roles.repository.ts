import { supabase } from "@/infrastructure/supabase/client";
import type { Database } from "@/infrastructure/supabase/types";

export type UserRoleRow = Pick<Database["public"]["Tables"]["user_roles"]["Row"], "role">;

/** Todos los roles del usuario (usado por el layout autenticado para el menú). */
export async function listUserRoles(userId: string): Promise<UserRoleRow[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return data ?? [];
}

/** true si el usuario tiene el rol "hr" (usado para autorizar el panel de RR. HH.). */
export async function hasHrRole(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "hr");
  return (data?.length ?? 0) > 0;
}
