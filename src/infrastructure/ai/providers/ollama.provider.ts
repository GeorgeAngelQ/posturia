import type { AIProvider, ChatMessage } from "@/domain/ai/ai-provider";

export type OllamaConfig = {
  baseUrl: string;
  model: string;
};

/**
 * Adapter para Ollama corriendo local o en otro host de la red.
 */
export class OllamaProvider implements AIProvider {
  readonly name = "ollama";

  constructor(private readonly config: OllamaConfig) {
    console.log("[Ollama] Provider creado", {
      baseUrl: this.config.baseUrl,
      model: this.config.model,
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const startedAt = Date.now();

    console.log("[Ollama] ===============================");
    console.log("[Ollama] Iniciando request");
    console.log("[Ollama] URL:", url);
    console.log("[Ollama] Modelo:", this.config.model);
    console.log("[Ollama] Mensajes:", messages.length);

    try {
      console.log("[Ollama] Enviando request...");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: false,
        }),
      });

      const elapsed = Date.now() - startedAt;

      console.log("[Ollama] Respuesta recibida");
      console.log("[Ollama] HTTP status:", res.status);
      console.log("[Ollama] Tiempo:", `${elapsed} ms`);

      if (!res.ok) {
        const body = await res.text();

        console.error("[Ollama] ❌ Error HTTP");
        console.error("[Ollama] Status:", res.status);
        console.error("[Ollama] Body:", body.slice(0, 500));

        throw new Error(
          `Ollama respondió ${res.status} en ${this.config.baseUrl}. ` +
            `¿Está corriendo (\`ollama serve\`) y el modelo "${this.config.model}" ` +
            `está descargado (\`ollama pull ${this.config.model}\`)? ` +
            `Detalle: ${body.slice(0, 300)}`,
        );
      }

      console.log("[Ollama] Parseando JSON...");

      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const content = json.choices?.[0]?.message?.content?.trim() ?? "";

      console.log("[Ollama] Respuesta procesada");
      console.log("[Ollama] Tiene contenido:", Boolean(content));
      console.log("[Ollama] Longitud respuesta:", content.length);
      console.log("[Ollama] Tiempo total:", `${Date.now() - startedAt} ms`);
      console.log("[Ollama] ✅ Ollama respondió correctamente");
      console.log("[Ollama] ===============================");

      return content;
    } catch (error) {
      const elapsed = Date.now() - startedAt;

      console.error("[Ollama] ===============================");
      console.error("[Ollama] ❌ ERROR");
      console.error("[Ollama] URL:", url);
      console.error("[Ollama] Modelo:", this.config.model);
      console.error("[Ollama] Tiempo hasta error:", `${elapsed} ms`);
      console.error("[Ollama] Error:", error);
      console.error("[Ollama] ===============================");

      throw error;
    }
  }
}
