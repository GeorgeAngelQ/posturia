import type { EmailProvider } from "@/domain/notifications/email-provider";
import { ConsoleEmailProvider } from "./providers/console-email.provider";
import { ResendEmailProvider } from "./providers/resend-email.provider";
import { BrevoEmailProvider } from "./providers/brevo-email.provider";

let cachedProvider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;

  const kind = (process.env["EMAIL_PROVIDER"] ?? "console").trim().toLowerCase();

  switch (kind) {
    case "console":
      cachedProvider = new ConsoleEmailProvider();
      break;

    case "resend": {
      const apiKey = process.env["RESEND_API_KEY"];
      const from = process.env["EMAIL_FROM"];
      if (!apiKey || !from) {
        throw new Error(
          'EMAIL_PROVIDER="resend" pero falta RESEND_API_KEY y/o EMAIL_FROM en el .env. ' +
            'Usa EMAIL_PROVIDER="console" para no enviar correos reales mientras desarrollas.',
        );
      }
      cachedProvider = new ResendEmailProvider({ apiKey, from });
      break;
    }
    case "brevo": {
      const apiKey = process.env["BREVO_API_KEY"];
      const from = process.env["BREVO_EMAIL_FROM"];
      const senderName = process.env["BREVO_SENDER_NAME"] ?? "Posturia";

      if (!apiKey || !from) {
        throw new Error("Faltan BREVO_API_KEY o BREVO_EMAIL_FROM");
      }

      cachedProvider = new BrevoEmailProvider({
        apiKey,
        from,
        senderName,
      });
      break;
    }

    default:
      throw new Error(
        `EMAIL_PROVIDER="${kind}" desconocido. Valores soportados: "console" | "resend | brevo".`,
      );
  }

  return cachedProvider;
}

/** Solo para tests: limpia el provider cacheado entre casos. */
export function resetEmailProviderCache(): void {
  cachedProvider = undefined;
}
