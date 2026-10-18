import type { OrganizationMembership } from "@/domain/organization/organization.types";

export function resolveCurrentOrganization(
  memberships: OrganizationMembership[],
): OrganizationMembership | null {
  return memberships[0] ?? null;
}
