import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/infrastructure/supabase/auth-middleware";
import { sendInviteEmail } from "@/application/notifications/send-invite-email.usecase";
import { getEmailProvider } from "@/infrastructure/notifications/email-provider.factory";

const Input = z.object({
  orgId: z.string().uuid(),
  to: z.string().email(),
  orgName: z.string(),
  role: z.enum(["owner", "hr", "employee"]),
  departmentName: z.string().nullable(),
  inviteLink: z.string().url(),
  locale: z.enum(["es", "en"]),
});

export const sendInviteEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_org_admin_access", {
      _org_id: data.orgId,
      _user_id: context.userId,
    });
    if (error || !isAdmin) {
      throw new Error("No tienes permisos de administrador en esta organización.");
    }

    const provider = getEmailProvider();
    await sendInviteEmail(provider, {
      to: data.to,
      orgName: data.orgName,
      role: data.role,
      departmentName: data.departmentName,
      inviteLink: data.inviteLink,
      locale: data.locale,
    });

    return { delivered: provider.name !== "console", provider: provider.name };
  });
