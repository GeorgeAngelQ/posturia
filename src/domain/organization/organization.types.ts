export type OrgRole = "owner" | "hr" | "employee";

export interface OrganizationMembership {
  orgId: string;
  role: OrgRole;
  departmentId: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
}

export function isOrgAdmin(role: OrgRole): boolean {
  return role === "owner" || role === "hr";
}

export interface OrgMemberSummary {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: OrgRole;
  departmentId: string | null;
  departmentName: string | null;
}

export interface Department {
  id: string;
  name: string;
}

export interface OrganizationInvite {
  id: string;
  email: string;
  role: OrgRole;
  departmentId: string | null;
  expiresAt: string;
  createdAt: string;
}

export function isInviteExpired(invite: OrganizationInvite): boolean {
  return new Date(invite.expiresAt).getTime() < Date.now();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
