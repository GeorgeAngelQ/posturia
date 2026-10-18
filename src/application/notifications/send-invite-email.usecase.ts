import type { EmailProvider } from "@/domain/notifications/email-provider";
import type { OrgRole } from "@/domain/organization/organization.types";

export type InviteEmailLocale = "es" | "en";

export type InviteEmailData = {
  to: string;
  orgName: string;
  role: OrgRole;
  departmentName: string | null;
  inviteLink: string;
  locale: InviteEmailLocale;
};

const roleLabels: Record<InviteEmailLocale, Record<OrgRole, string>> = {
  es: { owner: "Dueño", hr: "RR. HH.", employee: "Colaborador" },
  en: { owner: "Owner", hr: "HR", employee: "Employee" },
};

function subject(data: InviteEmailData): string {
  return data.locale === "en"
    ? `You've been invited to join ${data.orgName} on PosturaIA`
    : `Te invitaron a ${data.orgName} en PosturaIA`;
}

function textBody(data: InviteEmailData): string {
  const role = roleLabels[data.locale][data.role];
  if (data.locale === "en") {
    return [
      `You've been invited to join ${data.orgName} on PosturaIA as ${role}.`,
      data.departmentName ? `Department: ${data.departmentName}` : "",
      "",
      `Create your account with this exact email address to join automatically:`,
      data.inviteLink,
      "",
      "This link expires in 7 days.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `Te invitaron a unirte a ${data.orgName} en PosturaIA como ${role}.`,
    data.departmentName ? `Departamento: ${data.departmentName}` : "",
    "",
    "Crea tu cuenta con este mismo correo para unirte automáticamente:",
    data.inviteLink,
    "",
    "Este enlace vence en 7 días.",
  ]
    .filter(Boolean)
    .join("\n");
}

function htmlBody(data: InviteEmailData): string {
  const role = roleLabels[data.locale][data.role];
  const title =
    data.locale === "en"
      ? `Join ${data.orgName} on PosturaIA`
      : `Únete a ${data.orgName} en PosturaIA`;
  const cta = data.locale === "en" ? "Create my account" : "Crear mi cuenta";
  const expiry =
    data.locale === "en" ? "This link expires in 7 days." : "Este enlace vence en 7 días.";
  const roleLine =
    (data.locale === "en" ? "Role: " : "Rol: ") +
    role +
    (data.departmentName
      ? (data.locale === "en" ? " · Department: " : " · Departamento: ") + data.departmentName
      : "");

  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2430;">
      <h1 style="font-size: 20px; margin-bottom: 4px;">${title}</h1>
      <p style="font-size: 14px; color: #5b6270; margin-top: 0;">${roleLine}</p>
      <p style="font-size: 14px; line-height: 1.5;">
        ${data.locale === "en" ? "Click below and sign up with this exact email address to join automatically." : "Haz clic abajo y regístrate con este mismo correo para unirte automáticamente."}
      </p>
      <p style="margin: 24px 0;">
        <a href="${data.inviteLink}"
           style="background:#16a37a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">
          ${cta}
        </a>
      </p>
      <p style="font-size: 12px; color: #8a90a0;">${expiry}</p>
    </div>
  `.trim();
}

/**
 * Caso de uso: arma y envía el correo de invitación a una organización.
 * No sabe de Resend, SMTP ni de HTTP — solo depende del puerto
 * `EmailProvider` (dominio), igual que `diagnosePostureSession` depende de
 * `AIProvider`.
 */
export async function sendInviteEmail(
  provider: EmailProvider,
  data: InviteEmailData,
): Promise<void> {
  await provider.send({
    to: data.to,
    subject: subject(data),
    html: htmlBody(data),
    text: textBody(data),
  });
}
