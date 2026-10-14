import type { AIProvider, ChatMessage } from "@/domain/ai/ai-provider";

export type LovableGatewayConfig = {
  apiKey: string;
  model?: string | undefined;
};

const DEFAULT_MODEL = "google/gemini-3.8-flash";

/**
 * Adapter para el AI Gateway de Lovable Cloud. Se mantiene como alternativa
 * para cuando el proyecto sigue desplegado en Lovable y ya tiene
 * LOVABLE_API_KEY disponible; no es obligatorio para correr local con Ollama.
 */
export class LovableGatewayProvider implements AIProvider {
  readonly name = "lovable-gateway";

  constructor(private readonly config: LovableGatewayConfig) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": this.config.apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: this.config.model ?? DEFAULT_MODEL,
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI gateway ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  }
}
