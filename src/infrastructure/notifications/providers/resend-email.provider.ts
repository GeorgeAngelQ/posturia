import type { EmailMessage, EmailProvider } from "@/domain/notifications/email-provider";

export type ResendConfig = {
  apiKey: string;
  from: string;
};

/**
 * Adapter para Resend (https://resend.com) vía su API HTTP directa — sin el
 * SDK, para no sumar una dependencia extra por un solo `fetch`.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(private readonly config: ResendConfig) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.contentBase64,
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Resend respondió ${res.status} al enviar a ${message.to}. ` +
          `Revisa RESEND_API_KEY y EMAIL_FROM en el .env. Detalle: ${body.slice(0, 300)}`,
      );
    }
  }
}
