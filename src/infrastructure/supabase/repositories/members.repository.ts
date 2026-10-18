import { supabase } from "@/infrastructure/supabase/client";
import type { OrgMemberSummary, OrgRole } from "@/domain/organization/organization.types";

export async function listOrgMembers(orgId: string): Promise<OrgMemberSummary[]> {
  const { data: members, error: membersError } = await supabase
    .from("organization_members")
    .select("id, user_id, role, department_id, departments(name)")
    .eq("org_id", orgId);
  if (membersError) throw membersError;
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return members.map((m) => {
    const profile = profileById.get(m.user_id);
    return {
      id: m.id,
      userId: m.user_id,
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? "",
      role: m.role,
      departmentId: m.department_id,
      departmentName: m.departments?.name ?? null,
    };
  });
}

export async function updateMemberRole(memberId: string, role: OrgRole): Promise<void> {
  const { error } = await supabase.from("organization_members").update({ role }).eq("id", memberId);
  if (error) throw error;
}

export async function updateMemberDepartment(
  memberId: string,
  departmentId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .update({ department_id: departmentId })
    .eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
  if (error) throw error;
}
