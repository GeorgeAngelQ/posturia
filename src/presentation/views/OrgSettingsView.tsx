import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Copy, Mail, Plus, Trash2, UserX } from "lucide-react";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useOrganization } from "@/presentation/organization/organization-context";
import { getOrganization } from "@/infrastructure/supabase/repositories/organizations.repository";
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
} from "@/infrastructure/supabase/repositories/departments.repository";
import {
  createInvite,
  listPendingInvites,
  revokeInvite,
} from "@/infrastructure/supabase/repositories/invites.repository";
import {
  listOrgMembers,
  removeMember,
  updateMemberDepartment,
  updateMemberRole,
} from "@/infrastructure/supabase/repositories/members.repository";
import { sendInviteEmailFn } from "@/infrastructure/server-functions/send-invite-email.server";
import { prepareDepartmentName } from "@/application/organization/prepare-department-name.usecase";
import { prepareInvite } from "@/application/organization/prepare-invite.usecase";
import { isInviteExpired, type OrgRole } from "@/domain/organization/organization.types";

const fieldClass =
  "w-full rounded-lg border border-input bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Panel de administración del tenant: departamentos, invitaciones y miembros. */
export function OrgSettingsView() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { membership, isHr, loading: orgLoading } = useOrganization();
  const orgId = membership?.orgId;
  const isOwner = membership?.role === "owner";
  const sendInviteEmail = useServerFn(sendInviteEmailFn);

  const orgQuery = useQuery({
    queryKey: ["org-info", orgId],
    enabled: Boolean(isHr && orgId),
    queryFn: () => getOrganization(orgId!),
  });
  const departmentsQuery = useQuery({
    queryKey: ["org-departments", orgId],
    enabled: Boolean(isHr && orgId),
    queryFn: () => listDepartments(orgId!),
  });
  const invitesQuery = useQuery({
    queryKey: ["org-invites", orgId],
    enabled: Boolean(isHr && orgId),
    queryFn: () => listPendingInvites(orgId!),
  });
  const membersQuery = useQuery({
    queryKey: ["org-members-admin", orgId],
    enabled: Boolean(isHr && orgId),
    queryFn: () => listOrgMembers(orgId!),
  });

  const [newDeptName, setNewDeptName] = useState("");
  const [savingDept, setSavingDept] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("employee");
  const [inviteDept, setInviteDept] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  if (orgLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!isHr || !orgId) {
    return <div className="panel p-6 text-sm text-muted-foreground">{t("org.noAccess")}</div>;
  }

  const departments = departmentsQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const members = membersQuery.data ?? [];

  const addDepartment = async (e: FormEvent) => {
    e.preventDefault();
    const result = prepareDepartmentName(newDeptName);
    if (!result.ok) return;
    setSavingDept(true);
    try {
      await createDepartment(orgId, result.value);
      setNewDeptName("");
      await departmentsQuery.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingDept(false);
    }
  };

  const removeDepartment = async (departmentId: string) => {
    if (!window.confirm(t("org.confirmDeleteDepartment"))) return;
    try {
      await deleteDepartment(departmentId);
      await Promise.all([departmentsQuery.refetch(), membersQuery.refetch()]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const prepared = prepareInvite({
      email: inviteEmail,
      role: inviteRole,
      departmentId: inviteDept || null,
    });
    if (!prepared.ok) {
      toast.error(t("org.inviteInvalidEmail"));
      return;
    }
    setSendingInvite(true);
    try {
      await createInvite({
        orgId,
        email: prepared.value.email,
        role: prepared.value.role,
        departmentId: prepared.value.departmentId,
        invitedBy: user.id,
      });
      setInviteEmail("");
      setInviteRole("employee");
      setInviteDept("");
      await invitesQuery.refetch();

      // La invitación ya quedó creada (lo de arriba); el envío de correo es
      // "mejor esfuerzo": si falla, la invitación sigue existiendo y se
      // puede compartir con "Copiar enlace".
      const inviteLink = `${window.location.origin}/auth?email=${encodeURIComponent(prepared.value.email)}`;
      try {
        const result = await sendInviteEmail({
          data: {
            orgId,
            to: prepared.value.email,
            orgName: orgQuery.data?.name ?? "PosturaIA",
            role: prepared.value.role,
            departmentName:
              departments.find((d) => d.id === prepared.value.departmentId)?.name ?? null,
            inviteLink,
            locale,
          },
        });
        toast.success(result.delivered ? t("org.inviteSentEmail") : t("org.inviteSent"));
      } catch (emailErr) {
        console.error(emailErr);
        toast.warning(t("org.inviteEmailFailed"));
      }
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      toast.error(code === "23505" ? t("org.inviteDuplicate") : errorMessage(err));
    } finally {
      setSendingInvite(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    if (!window.confirm(t("org.confirmCancelInvite"))) return;
    try {
      await revokeInvite(inviteId);
      await invitesQuery.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const copyInviteLink = async (email: string) => {
    const link = `${window.location.origin}/auth?email=${encodeURIComponent(email)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("org.linkCopied"));
    } catch {
      toast.error(link);
    }
  };

  const changeMemberRole = async (memberId: string, role: OrgRole) => {
    try {
      await updateMemberRole(memberId, role);
      await membersQuery.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const changeMemberDepartment = async (memberId: string, departmentId: string) => {
    try {
      await updateMemberDepartment(memberId, departmentId || null);
      await membersQuery.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const kickMember = async (memberId: string) => {
    if (!window.confirm(t("org.confirmRemoveMember"))) return;
    try {
      await removeMember(memberId);
      await membersQuery.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">
          {t("org.title")}
          {orgQuery.data?.name && (
            <span className="text-muted-foreground"> · {orgQuery.data.name}</span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("org.sub")}</p>
      </header>

      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("org.departments")}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("org.departmentsHint")}</p>

        <form onSubmit={addDepartment} className="mt-4 flex flex-wrap gap-2">
          <input
            className={`${fieldClass} max-w-xs`}
            placeholder={t("org.newDepartment")}
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
          />
          <button
            type="submit"
            disabled={savingDept || !newDeptName.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Plus className="size-4" /> {t("org.add")}
          </button>
        </form>

        <ul className="mt-4 divide-y divide-border">
          {departments.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">{t("org.noDepartments")}</li>
          )}
          {departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-3">
              <span className="text-sm font-medium">{d.name}</span>
              <button
                onClick={() => removeDepartment(d.id)}
                className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
              >
                <Trash2 className="size-3.5" /> {t("org.deleteDepartment")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("org.invites")}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("org.invitesHint")}</p>

        <form onSubmit={sendInvite} className="mt-4 grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
          <input
            className={fieldClass}
            type="email"
            placeholder={t("org.inviteEmail")}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <select
            className={fieldClass}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as OrgRole)}
          >
            <option value="employee">{t("org.role.employee")}</option>
            <option value="hr">{t("org.role.hr")}</option>
          </select>
          <select
            className={fieldClass}
            value={inviteDept}
            onChange={(e) => setInviteDept(e.target.value)}
          >
            <option value="">{t("org.inviteDeptNone")}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={sendingInvite}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Mail className="size-4" /> {t("org.sendInvite")}
          </button>
        </form>

        <ul className="mt-4 divide-y divide-border">
          {invites.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">{t("org.noInvites")}</li>
          )}
          {invites.map((inv) => {
            const expired = isInviteExpired(inv);
            return (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`org.role.${inv.role}`)} · {t("org.expiresOn")}{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      expired
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-warning text-warning-foreground"
                    }`}
                  >
                    {expired ? t("org.status.expired") : t("org.status.pending")}
                  </span>
                  <button
                    onClick={() => copyInviteLink(inv.email)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-muted"
                  >
                    <Copy className="size-3.5" /> {t("org.copyLink")}
                  </button>
                  <button
                    onClick={() => cancelInvite(inv.id)}
                    className="text-xs font-medium text-destructive hover:underline"
                  >
                    {t("org.cancelInvite")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel overflow-x-auto p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("org.members")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("org.membersHint")}
          {!isOwner && ` ${t("org.ownerOnlyHint")}`}
        </p>

        <table className="mt-4 w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-3">{t("hr.employee")}</th>
              <th className="pb-3">{t("org.inviteRole")}</th>
              <th className="pb-3">{t("hr.dept")}</th>
              <th className="pb-3" />
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-muted-foreground">
                  {t("org.noMembers")}
                </td>
              </tr>
            )}
            {members.map((m) => {
              const editable = isOwner && m.role !== "owner";
              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-3">
                    <p className="font-medium">{m.fullName || m.email}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="py-3">
                    {editable ? (
                      <select
                        className={fieldClass}
                        value={m.role}
                        onChange={(e) => changeMemberRole(m.id, e.target.value as OrgRole)}
                      >
                        <option value="employee">{t("org.role.employee")}</option>
                        <option value="hr">{t("org.role.hr")}</option>
                      </select>
                    ) : (
                      <span className="text-muted-foreground">{t(`org.role.${m.role}`)}</span>
                    )}
                  </td>
                  <td className="py-3">
                    {editable ? (
                      <select
                        className={fieldClass}
                        value={m.departmentId ?? ""}
                        onChange={(e) => changeMemberDepartment(m.id, e.target.value)}
                      >
                        <option value="">{t("org.unassigned")}</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-muted-foreground">
                        {m.departmentName ?? t("org.unassigned")}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {editable && (
                      <button
                        onClick={() => kickMember(m.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
                      >
                        <UserX className="size-3.5" /> {t("org.removeMember")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
