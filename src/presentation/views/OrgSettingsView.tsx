import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Check,
  Copy,
  LayoutGrid,
  Mail,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";
import { PrivacySettingsCard } from "@/presentation/components/PrivacySettingsCard";
import { useI18n } from "@/presentation/i18n/i18n";
import { useAuth } from "@/presentation/hooks/useAuth";
import { useOrganization } from "@/presentation/organization/organization-context";
import { getOrganization } from "@/infrastructure/supabase/repositories/organizations.repository";
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  renameDepartment,
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
import {
  Avatar,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  SegmentedTabs,
} from "@/presentation/components/kit";

const fieldClass =
  "w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";

const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60";

const iconButton =
  "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** Colores de segmento para la barra de distribución (tokens de gráfico). */
const SEGMENT_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

const PAGE_SIZE = 5;

type Tab = "overview" | "departments" | "invites" | "members";

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

  const [tab, setTab] = useState<Tab>("overview");

  const [newDeptName, setNewDeptName] = useState("");
  const [savingDept, setSavingDept] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("employee");
  const [inviteDept, setInviteDept] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const departments = departmentsQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const members = membersQuery.data ?? [];

  const fill = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), template);

  // Miembros por departamento (real) para chips "N pers." y barra de distribución.
  const memberCountByDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.departmentId) map.set(m.departmentId, (map.get(m.departmentId) ?? 0) + 1);
    }
    return map;
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, search]);

  if (orgLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!isHr || !orgId) {
    return <Card className="text-sm text-muted-foreground">{t("org.noAccess")}</Card>;
  }

  const orgName = orgQuery.data?.name ?? "";
  const totalMembers = members.length;
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageMembers = filteredMembers.slice(pageStart, pageStart + PAGE_SIZE);

  const distribution = departments
    .map((d) => ({ id: d.id, name: d.name, count: memberCountByDept.get(d.id) ?? 0 }))
    .filter((d) => d.count > 0);
  const distributionTotal = distribution.reduce((acc, d) => acc + d.count, 0);

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

  const startRename = (id: string, name: string) => {
    setEditingDeptId(id);
    setEditingDeptName(name);
  };

  const submitRename = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingDeptId) return;
    const result = prepareDepartmentName(editingDeptName);
    if (!result.ok) return;
    try {
      await renameDepartment(editingDeptId, result.value);
      setEditingDeptId(null);
      await Promise.all([departmentsQuery.refetch(), membersQuery.refetch()]);
    } catch (err) {
      toast.error(errorMessage(err));
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

  const expiryLabel = (expiresAt: string) => {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return t("org.expiresToday");
    if (days === 1) return t("org.expiresInOne");
    return fill(t("org.expiresIn"), { n: days });
  };

  const showDepartments = tab === "overview" || tab === "departments";
  const showInvites = tab === "overview" || tab === "invites";
  const showMembers = tab === "overview" || tab === "members";

  const plan = orgQuery.data?.plan ?? "";
  const planActive = orgQuery.data?.isActive ?? true;

  const departmentsCard = (
    <Card className="flex flex-col">
      <CardHeader
        icon={Building2}
        title={t("org.units")}
        subtitle={t("org.unitsHint")}
        right={<Chip tone="neutral">{fill(t("org.activeCount"), { n: departments.length })}</Chip>}
      />

      <form
        onSubmit={addDepartment}
        className="mt-5 flex flex-wrap gap-2 rounded-2xl bg-secondary/70 p-2"
      >
        <div className="relative min-w-0 flex-1">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${fieldClass} pl-9`}
            placeholder={t("org.newDepartmentPlaceholder")}
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={savingDept || !newDeptName.trim()}
          className={buttonPrimary}
        >
          <Plus className="size-4" /> {t("org.createDept")}
        </button>
      </form>

      <ul className="mt-4 space-y-2">
        {departments.length === 0 && (
          <li>
            <EmptyState>{t("org.noDepartments")}</EmptyState>
          </li>
        )}
        {departments.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-secondary/50 p-3"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info-soft-foreground">
              <Building2 className="size-5" />
            </span>
            {editingDeptId === d.id ? (
              <form onSubmit={submitRename} className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  autoFocus
                  className={fieldClass}
                  value={editingDeptName}
                  onChange={(e) => setEditingDeptName(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!editingDeptName.trim()}
                  aria-label={t("org.save")}
                  title={t("org.save")}
                  className={iconButton}
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDeptId(null)}
                  aria-label={t("org.cancel")}
                  title={t("org.cancel")}
                  className={iconButton}
                >
                  <X className="size-4" />
                </button>
              </form>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-bold">{d.name}</span>
                  <Chip tone="neutral">
                    {fill(t("org.persons"), { n: memberCountByDept.get(d.id) ?? 0 })}
                  </Chip>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startRename(d.id, d.name)}
                    aria-label={t("org.edit")}
                    title={t("org.edit")}
                    className={iconButton}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDepartment(d.id)}
                    aria-label={t("org.deleteDepartment")}
                    title={t("org.deleteDepartment")}
                    className={`${iconButton} hover:text-destructive`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {distributionTotal > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span>{t("org.distribution")}</span>
            <span>{fill(t("org.collaboratorsTotal"), { n: totalMembers })}</span>
          </div>
          <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {distribution.map((d, i) => (
              <div
                key={d.id}
                className={SEGMENT_CLASSES[i % SEGMENT_CLASSES.length]}
                style={{ width: `${(d.count / distributionTotal) * 100}%` }}
                title={d.name}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {distribution.map((d, i) => (
              <li key={d.id} className="inline-flex items-center gap-1.5">
                <span
                  className={`size-2 rounded-full ${SEGMENT_CLASSES[i % SEGMENT_CLASSES.length]}`}
                />
                {d.name} ({Math.round((d.count / distributionTotal) * 100)}%)
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-success-soft p-4 text-sm text-success-soft-foreground">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" />
        <p className="leading-relaxed">{t("org.privacyNote")}</p>
      </div>
    </Card>
  );

  const invitesCard = (
    <Card className="flex flex-col">
      <CardHeader
        icon={UserPlus}
        iconTone="success"
        title={t("org.invitesTitle")}
        subtitle={t("org.invitesHint")}
        right={
          <Chip tone="success" dot>
            {fill(t("org.pendingCount"), { n: invites.length })}
          </Chip>
        }
      />

      <form onSubmit={sendInvite} className="mt-5 space-y-3 rounded-2xl bg-secondary/70 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
            {t("org.corpEmail")}
          </span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${fieldClass} pl-9`}
              type="email"
              placeholder={t("org.emailPlaceholder")}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              {t("org.assignedRole")}
            </span>
            <select
              className={fieldClass}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
            >
              <option value="employee">{t("org.role.employee")}</option>
              <option value="hr">{t("org.role.hr")}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              {t("org.department")}
            </span>
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
          </label>
        </div>
        <button type="submit" disabled={sendingInvite} className={`${buttonPrimary} w-full`}>
          <Send className="size-4" /> {t("org.sendCorpInvite")}
        </button>
        <p className="text-center text-xs text-muted-foreground">{t("org.inviteExpiryNote")}</p>
      </form>

      <p className="eyebrow mt-6">{t("org.recentLinks")}</p>
      <ul className="mt-3 space-y-2">
        {invites.length === 0 && (
          <li>
            <EmptyState>{t("org.noInvites")}</EmptyState>
          </li>
        )}
        {invites.map((inv) => {
          const expired = isInviteExpired(inv);
          const deptName = departments.find((d) => d.id === inv.departmentId)?.name;
          return (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-secondary/50 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold">{inv.email}</p>
                  <Chip tone={inv.role === "hr" ? "success" : "neutral"}>
                    {t(`org.role.${inv.role}`)}
                  </Chip>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {deptName && <span>{deptName} •</span>}
                  <span>{expired ? t("org.expiredStatus") : expiryLabel(inv.expiresAt)}</span>
                  <span>•</span>
                  <span className={expired ? "text-danger-strong" : "text-warning-strong"}>
                    {expired ? t("org.status.expired") : t("org.pendingStatus")}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => copyInviteLink(inv.email)}
                  aria-label={t("org.copyLink")}
                  title={t("org.copyLink")}
                  className={iconButton}
                >
                  <Copy className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => cancelInvite(inv.id)}
                  aria-label={t("org.cancelInvite")}
                  title={t("org.cancelInvite")}
                  className={`${iconButton} hover:text-destructive`}
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );

  const membersCard = (
    <Card>
      <CardHeader
        icon={Users}
        title={t("org.membersTitle")}
        subtitle={isOwner ? t("org.membersHint") : t("org.membersOwnerOnly")}
        right={
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${fieldClass} pl-9`}
              placeholder={t("org.searchMembers")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        }
      />

      <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="eyebrow bg-secondary/70 text-left">
              <th className="px-4 py-3 font-semibold">{t("org.colCollaborator")}</th>
              <th className="px-4 py-3 font-semibold">{t("org.colDepartment")}</th>
              <th className="px-4 py-3 font-semibold">{t("org.colRole")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("org.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {pageMembers.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState>
                    {members.length === 0 ? t("org.noMembers") : t("org.noResults")}
                  </EmptyState>
                </td>
              </tr>
            )}
            {pageMembers.map((m) => {
              const editable = isOwner && m.role !== "owner";
              const isMe = m.userId === user?.id;
              const name = m.fullName || m.email;
              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={name} dot={isMe} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-bold">
                          <span className="truncate">{name}</span>
                          {isMe && <Chip tone="info">{t("org.you")}</Chip>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    {m.role === "owner" ? (
                      <Chip tone="info" icon={ShieldCheck}>
                        {t("org.ownerChip")}
                      </Chip>
                    ) : editable ? (
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
                  <td className="px-4 py-3 text-right">
                    {m.role === "owner" ? (
                      <span className="text-xs italic text-muted-foreground">
                        {t("org.immutable")}
                      </span>
                    ) : (
                      editable && (
                        <button
                          type="button"
                          onClick={() => kickMember(m.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline"
                        >
                          <UserX className="size-3.5" /> {t("org.removeMember")}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredMembers.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {fill(t("org.showing"), {
              from: pageStart + 1,
              to: Math.min(pageStart + PAGE_SIZE, filteredMembers.length),
              total: filteredMembers.length,
            })}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground disabled:opacity-50"
              >
                {t("org.prev")}
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  aria-current={n === currentPage ? "page" : undefined}
                  className={`size-8 rounded-lg text-xs font-bold ${
                    n === currentPage
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
                className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground disabled:opacity-50"
              >
                {t("org.next")}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
        <div className="min-w-0 max-w-3xl">
          <p className="eyebrow font-mono">
            {t("org.eyebrow")} › {t("org.eyebrowTenant")} /{" "}
            <span className="rounded-md bg-info-soft px-1.5 py-0.5 text-info-soft-foreground">
              ORG-UUID: {orgId.slice(0, 8)}
            </span>
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-[1.1] md:text-4xl">
            {t("org.title")}
          </h1>
          {plan && (
            <div className="mt-3">
              <Chip tone={planActive ? "success" : "neutral"} dot>
                {fill(t(planActive ? "org.planActive" : "org.planInactive"), {
                  plan: plan.charAt(0).toUpperCase() + plan.slice(1),
                })}
              </Chip>
            </div>
          )}
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            {orgName ? fill(t("org.subFor"), { org: orgName }) : t("org.sub")}
          </p>
        </div>

        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3 lg:grid-cols-1">
          <StatCard
            icon={Users}
            tone="info"
            label={t("org.stat.members")}
            value={String(totalMembers)}
          />
          <StatCard
            icon={LayoutGrid}
            tone="info"
            label={t("org.stat.departments")}
            value={String(departments.length)}
          />
          <StatCard
            icon={Mail}
            tone="success"
            label={t("org.stat.invites")}
            value={fill(t("org.stat.pending"), { n: invites.length })}
          />
        </div>
      </header>

      <SegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: t("org.tab.overview"), icon: LayoutGrid },
          {
            value: "departments",
            label: t("org.tab.departments"),
            icon: Building2,
            badge: departments.length,
          },
          { value: "invites", label: t("org.tab.invites"), icon: Mail, badge: invites.length },
          { value: "members", label: t("org.tab.members"), icon: Users },
        ]}
      />

      {tab === "overview" && membership && (
        <PrivacySettingsCard orgId={membership.orgId} isOwner={isOwner} />
      )}

      {(showDepartments || showInvites) && (
        <div
          className={`grid gap-6 ${
            showDepartments && showInvites ? "lg:grid-cols-[1.35fr_1fr]" : "grid-cols-1"
          }`}
        >
          {showDepartments && departmentsCard}
          {showInvites && invitesCard}
        </div>
      )}
      {showMembers && membersCard}
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Users;
  tone: "info" | "success";
  label: string;
  value: string;
}) {
  const toneClass =
    tone === "success"
      ? "bg-success-soft text-success-soft-foreground"
      : "bg-info-soft text-info-soft-foreground";
  return (
    <div className="panel flex items-center gap-3 px-4 py-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-extrabold leading-tight">{value}</p>
      </div>
    </div>
  );
}
