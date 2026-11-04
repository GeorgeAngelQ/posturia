import type { AIProvider, ChatMessage, ChatOptions } from "@/domain/ai/ai-provider";

import { buildChatBody, signalInit } from "@/infrastructure/ai/chat-request";

export type GrokConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export class GrokProvider implements AIProvider {
  readonly name = "grok";
  readonly model: string;

  private readonly baseUrl: string;

  constructor(private readonly config: GrokConfig) {
    this.model = config.model;

    this.baseUrl = (config.baseUrl ?? "https://api.x.ai/v1").replace(/\/+$/, "");

    if (!config.apiKey) {
      throw new Error("[Grok] XAI_API_KEY no está configurada");
    }

    console.log("[Grok] Provider creado", {
      baseUrl: this.baseUrl,
      model: this.model,
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const startedAt = Date.now();

    console.log("[Grok] ===============================");
    console.log("[Grok] Iniciando request");
    console.log("[Grok] URL:", url);
    console.log("[Grok] Modelo:", this.model);
    console.log("[Grok] Mensajes:", messages.length);

    try {
      console.log("[Grok] Enviando request...");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(buildChatBody(this.model, messages, options)),
        ...signalInit(options),
      });

      const elapsed = Date.now() - startedAt;

      console.log("[Grok] Respuesta recibida");
      console.log("[Grok] HTTP status:", res.status);
      console.log("[Grok] Tiempo:", `${elapsed} ms`);

      if (!res.ok) {
        const body = await res.text();

        console.error("[Grok] ❌ Error HTTP");
        console.error("[Grok] Status:", res.status);
        console.error("[Grok] Body:", body.slice(0, 500));

        throw new Error(
          `Grok respondió ${res.status}. ` +
            `Verifica tu API Key, el modelo "${this.model}" ` +
            `y los permisos de tu cuenta. ` +
            `Detalle: ${body.slice(0, 300)}`,
        );
      }

      console.log("[Grok] Parseando JSON...");

      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      };

      const content = json.choices?.[0]?.message?.content?.trim() ?? "";

      if (!content) {
        throw new Error("[Grok] La API respondió correctamente, pero no devolvió contenido.");
      }

      console.log("[Grok] Respuesta procesada");
      console.log("[Grok] Tiene contenido:", Boolean(content));
      console.log("[Grok] Longitud respuesta:", content.length);
      console.log("[Grok] Tiempo total:", `${Date.now() - startedAt} ms`);
      console.log("[Grok] ✅ Grok respondió correctamente");
      console.log("[Grok] ===============================");

      return content;
    } catch (error) {
      const elapsed = Date.now() - startedAt;

      console.error("[Grok] ===============================");
      console.error("[Grok] ❌ ERROR");
      console.error("[Grok] URL:", url);
      console.error("[Grok] Modelo:", this.model);
      console.error("[Grok] Tiempo hasta error:", `${elapsed} ms`);
      console.error("[Grok] Error:", error);
      console.error("[Grok] ===============================");

      throw error;
    }
  }
}
