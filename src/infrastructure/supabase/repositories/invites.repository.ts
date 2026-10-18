import { supabase } from "@/infrastructure/supabase/client";
import type { Database } from "@/infrastructure/supabase/types";
import type { OrganizationInvite, OrgRole } from "@/domain/organization/organization.types";

type InviteRow = Pick<
  Database["public"]["Tables"]["organization_invites"]["Row"],
  "id" | "email" | "role" | "department_id" | "expires_at" | "created_at"
>;

function toInvite(row: InviteRow): OrganizationInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    departmentId: row.department_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function listPendingInvites(orgId: string): Promise<OrganizationInvite[]> {
  const { data, error } = await supabase
    .from("organization_invites")
    .select("id, email, role, department_id, expires_at, created_at")
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toInvite);
}

export type CreateInviteInput = {
  orgId: string;
  email: string;
  role: OrgRole;
  departmentId: string | null;
  invitedBy: string;
};

export async function createInvite(input: CreateInviteInput): Promise<OrganizationInvite> {
  const { data, error } = await supabase
    .from("organization_invites")
    .insert({
      org_id: input.orgId,
      email: input.email,
      role: input.role,
      department_id: input.departmentId,
      invited_by: input.invitedBy,
    })
    .select("id, email, role, department_id, expires_at, created_at")
    .single();
  if (error) throw error;
  return toInvite(data);
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from("organization_invites").delete().eq("id", inviteId);
  if (error) throw error;
}
