import type { EmailProvider } from "@/domain/notifications/email-provider";
import { ConsoleEmailProvider } from "./providers/console-email.provider";
import { ResendEmailProvider } from "./providers/resend-email.provider";

/**
 * Único punto donde se decide QUÉ motor de correo se usa, según
 * `EMAIL_PROVIDER`. Mismo patrón que `ai-provider.factory.ts`.
 *
 * Para agregar un proveedor nuevo:
 *   1. Crear `src/infrastructure/notifications/providers/mi-proveedor.provider.ts`
 *      implementando `EmailProvider`.
 *   2. Agregar un `case` acá abajo.
 *   3. Setear `EMAIL_PROVIDER=mi-proveedor` en el .env.
 */
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

    default:
      throw new Error(
        `EMAIL_PROVIDER="${kind}" desconocido. Valores soportados: "console" | "resend".`,
      );
  }

  return cachedProvider;
}

/** Solo para tests: limpia el provider cacheado entre casos. */
export function resetEmailProviderCache(): void {
  cachedProvider = undefined;
}
