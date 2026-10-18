import { supabase } from "@/infrastructure/supabase/client";
import type { Database } from "@/infrastructure/supabase/types";
import type {
  Organization,
  OrganizationMembership,
} from "@/domain/organization/organization.types";

type MyOrganizationsRow = Database["public"]["Functions"]["my_organizations"]["Returns"][number];
type OrganizationSummaryRow = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name" | "slug" | "plan" | "is_active"
>;

function toMembership(row: MyOrganizationsRow): OrganizationMembership {
  return {
    orgId: row.org_id,
    role: row.role,
    departmentId: row.department_id,
  };
}

function toOrganization(row: OrganizationSummaryRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    isActive: row.is_active,
  };
}

export async function getMyOrganizations(): Promise<OrganizationMembership[]> {
  const { data, error } = await supabase.rpc("my_organizations");
  if (error) throw error;
  return (data ?? []).map(toMembership);
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, is_active")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? toOrganization(data) : null;
}

export async function getDepartmentName(departmentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("departments")
    .select("name")
    .eq("id", departmentId)
    .maybeSingle();
  if (error) throw error;
  return data?.name ?? null;
}
