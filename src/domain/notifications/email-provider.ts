/**
 * Puerto (interfaz) que debe implementar cualquier motor de envío de correo.
 *
 * Misma idea que `domain/ai/ai-provider.ts`: el dominio/aplicación solo
 * conoce este contrato. Nada de API keys, SDKs ni `fetch` acá — eso vive en
 * los adapters de `src/infrastructure/notifications/providers/*`.
 *
 * Para agregar un proveedor nuevo (SMTP, SendGrid, Postmark, etc.) alcanza
 * con crear una clase que implemente esta interfaz y registrarla en
 * `email-provider.factory.ts`.
 */
export interface EmailAttachment {
  filename: string;
  /** Contenido binario del adjunto, codificado en base64 (portable entre Node y runtimes tipo Workers). */
  contentBase64: string;
  contentType?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface EmailProvider {
  /** Nombre corto del proveedor, para logs/telemetría. */
  readonly name: string;

  /**
   * Envía el correo. Debe lanzar si el proveedor no pudo entregarlo
   * (credenciales faltantes, error HTTP, etc.) — quien llama decide si
   * eso es fatal o solo se informa al usuario.
   */
  send(message: EmailMessage): Promise<void>;
}
