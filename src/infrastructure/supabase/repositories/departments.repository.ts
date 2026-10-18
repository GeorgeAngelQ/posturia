import { supabase } from "@/infrastructure/supabase/client";
import type { Database } from "@/infrastructure/supabase/types";
import type { Department } from "@/domain/organization/organization.types";

type DepartmentRow = Pick<Database["public"]["Tables"]["departments"]["Row"], "id" | "name">;

function toDepartment(row: DepartmentRow): Department {
  return { id: row.id, name: row.name };
}

export async function listDepartments(orgId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .eq("org_id", orgId)
    .order("name");
  if (error) throw error;
  return (data ?? []).map(toDepartment);
}

export async function createDepartment(orgId: string, name: string): Promise<Department> {
  const { data, error } = await supabase
    .from("departments")
    .insert({ org_id: orgId, name })
    .select("id, name")
    .single();
  if (error) throw error;
  return toDepartment(data);
}

export async function renameDepartment(departmentId: string, name: string): Promise<void> {
  const { error } = await supabase.from("departments").update({ name }).eq("id", departmentId);
  if (error) throw error;
}

export async function deleteDepartment(departmentId: string): Promise<void> {
  const { error } = await supabase.from("departments").delete().eq("id", departmentId);
  if (error) throw error;
}
