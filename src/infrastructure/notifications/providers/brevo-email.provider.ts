import type { EmailMessage, EmailProvider } from "@/domain/notifications/email-provider";

export type BrevoConfig = {
  apiKey: string;
  from: string;
  senderName?: string;
};

type BrevoResponse = {
  messageId?: string;
  message?: string;
  code?: string;
};

export class BrevoEmailProvider implements EmailProvider {
  readonly name = "brevo";

  constructor(private readonly config: BrevoConfig) {
    if (!config.apiKey?.trim()) {
      throw new Error("BREVO_API_KEY no está configurada");
    }

    if (!config.from?.trim()) {
      throw new Error("BREVO_EMAIL_FROM no está configurado");
    }
  }

  async send(message: EmailMessage): Promise<void> {
    const payload = {
      sender: {
        email: this.config.from,
        ...(this.config.senderName ? { name: this.config.senderName } : {}),
      },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
      ...(message.attachments?.length
        ? {
            attachment: message.attachments.map((a) => ({
              name: a.filename,
              content: a.contentBase64,
            })),
          }
        : {}),
    };

    let response: Response;

    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": this.config.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(
        `Error de conexión con Brevo: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`,
      );
    }

    const body = await response.text();

    let result: BrevoResponse = {};

    try {
      result = body ? JSON.parse(body) : {};
    } catch {
      // Respuesta no JSON.
    }

    if (!response.ok) {
      throw new Error(
        `Brevo respondió ${response.status}: ${result.message ?? body.slice(0, 300)}`,
      );
    }

    if (!result.messageId) {
      throw new Error("Brevo no devolvió el identificador del correo enviado");
    }
  }
}
