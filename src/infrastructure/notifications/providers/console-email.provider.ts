import type { EmailMessage, EmailProvider } from "@/domain/notifications/email-provider";

/**
 * Adapter por defecto: no envía nada por red, solo imprime el correo (y, lo
 * más importante, el enlace de invitación) en los logs del servidor.
 *
 * Igual que Ollama es el motor de IA "sin llaves" para correr local, este es
 * el motor de correo "sin llaves": permite usar el flujo de invitaciones
 * completo en desarrollo/Docker sin contratar un proveedor de email. El
 * admin ve el enlace en la consola, o lo copia desde el botón "Copiar
 * enlace" del panel — nunca se pierde la invitación por no tener este
 * proveedor configurado.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(message: EmailMessage): Promise<void> {
    console.log("[Email:console] ===============================");
    console.log("[Email:console] EMAIL_PROVIDER=console: no se envía por red.");
    console.log("[Email:console] Para enviar correos reales, configura EMAIL_PROVIDER=resend.");
    console.log("[Email:console] Para:", message.to);
    console.log("[Email:console] Asunto:", message.subject);
    if (message.attachments?.length) {
      console.log(
        "[Email:console] Adjuntos:",
        message.attachments.map((a) => `${a.filename} (${a.contentBase64.length} chars b64)`),
      );
    }
    console.log("[Email:console] ---");
    console.log(message.text);
    console.log("[Email:console] ===============================");
  }
}
