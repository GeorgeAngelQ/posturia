import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getDepartmentName,
  getMyOrganizations,
} from "@/infrastructure/supabase/repositories/organizations.repository";
import { resolveCurrentOrganization } from "@/application/organization/resolve-current-organization.usecase.";
import { isOrgAdmin, type OrganizationMembership } from "@/domain/organization/organization.types";

type OrganizationValue = {
  /** Membresía activa del usuario (org + rol + depto). `null` mientras carga o si no tiene ninguna. */
  membership: OrganizationMembership | null;
  /** Nombre del departamento de la membresía activa, o `null` si no tiene uno asignado. */
  departmentName: string | null;
  /** true mientras se resuelve la membresía por primera vez. */
  loading: boolean;
  /** Atajo: ¿el rol actual tiene acceso de administración del tenant (owner/hr)? */
  isHr: boolean;
  /** Vuelve a consultar las membresías (p. ej. tras aceptar una invitación). */
  refresh: () => Promise<void>;
};

const OrganizationContext = createContext<OrganizationValue>({
  membership: null,
  departmentName: null,
  loading: true,
  isHr: false,
  refresh: async () => {},
});

export function OrganizationProvider({
  userId,
  children,
}: {
  /** Id del usuario autenticado; la membresía solo se resuelve cuando hay sesión. */
  userId: string | undefined;
  children: ReactNode;
}) {
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) {
      setMembership(null);
      setDepartmentName(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const memberships = await getMyOrganizations();
    const current = resolveCurrentOrganization(memberships);
    setMembership(current);
    setDepartmentName(current?.departmentId ? await getDepartmentName(current.departmentId) : null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isHr = membership ? isOrgAdmin(membership.role) : false;

  return (
    <OrganizationContext.Provider
      value={{ membership, departmentName, loading, isHr, refresh: load }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
