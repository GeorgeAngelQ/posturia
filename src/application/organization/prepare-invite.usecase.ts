import { isValidEmail, type OrgRole } from "@/domain/organization/organization.types";

export type PrepareInviteInput = {
  email: string;
  role: OrgRole;
  departmentId: string | null;
};

export type PrepareInviteResult =
  { ok: true; value: PrepareInviteInput } | { ok: false; error: "invalid_email" };

export function prepareInvite(input: PrepareInviteInput): PrepareInviteResult {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };
  return { ok: true, value: { email, role: input.role, departmentId: input.departmentId } };
}
