import type { AIProvider, ChatMessage, ChatOptions } from "@/domain/ai/ai-provider";

import { signalInit } from "@/infrastructure/ai/chat-request";

export type GeminiConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxOutputTokens?: number;
  thinkingLevel?: "LOW" | "MEDIUM" | "HIGH";
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly model: string;

  private readonly baseUrl: string;

  constructor(private readonly config: GeminiConfig) {
    this.model = config.model;

    this.baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(
      /\/+$/,
      "",
    );

    if (!config.apiKey) {
      throw new Error("[Gemini] GEMINI_API_KEY no está configurada");
    }

    console.log("[Gemini] Provider creado", {
      baseUrl: this.baseUrl,
      model: this.model,
      thinkingLevel: config.thinkingLevel ?? "LOW",
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const startedAt = Date.now();

    console.log("[Gemini] ===============================");
    console.log("[Gemini] Iniciando request");
    console.log("[Gemini] URL:", url);
    console.log("[Gemini] Modelo:", this.model);
    console.log("[Gemini] Mensajes:", messages.length);

    try {
      const systemMessages = messages.filter((message) => message.role === "system");

      const conversationMessages = messages.filter((message) => message.role !== "system");

      const contents = conversationMessages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [
          {
            text: message.content,
          },
        ],
      }));

      const body = {
        contents,

        ...(systemMessages.length > 0 && {
          systemInstruction: {
            parts: systemMessages.map((message) => ({
              text: message.content,
            })),
          },
        }),

        generationConfig: {
          maxOutputTokens: options?.maxTokens ?? this.config.maxOutputTokens ?? 2048,
          temperature: options?.temperature,
          thinkingConfig: {
            thinkingLevel: this.config.thinkingLevel ?? "LOW",
          },
        },
      };

      console.log("[Gemini] Enviando request...");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify(body),
        ...signalInit(options),
      });

      const elapsed = Date.now() - startedAt;

      console.log("[Gemini] Respuesta recibida");
      console.log("[Gemini] HTTP status:", res.status);
      console.log("[Gemini] Tiempo:", `${elapsed} ms`);

      if (!res.ok) {
        const errorBody = await res.text();

        console.error("[Gemini] Error HTTP:", res.status);
        console.error("[Gemini] Detalle:", errorBody.slice(0, 500));

        throw new Error(
          `Gemini respondió ${res.status}. ` +
            `Verifica GEMINI_API_KEY, el modelo "${this.model}" ` +
            `y los límites de tu proyecto. ` +
            `Detalle: ${errorBody.slice(0, 300)}`,
        );
      }

      const json = (await res.json()) as GeminiResponse;

      if (json.promptFeedback?.blockReason) {
        throw new Error(`[Gemini] Solicitud bloqueada: ${json.promptFeedback.blockReason}`);
      }

      const candidate = json.candidates?.[0];

      const content =
        candidate?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("")
          .trim() ?? "";

      if (!content) {
        throw new Error(
          `[Gemini] Respuesta vacía. Finish reason: ${candidate?.finishReason ?? "desconocido"}`,
        );
      }

      console.log("[Gemini] Respuesta procesada");
      console.log("[Gemini] Longitud:", content.length);
      console.log("[Gemini] Finish reason:", candidate?.finishReason);
      console.log("[Gemini] Tiempo total:", `${Date.now() - startedAt} ms`);
      console.log("[Gemini] ✅ Gemini respondió correctamente");
      console.log("[Gemini] ===============================");

      return content;
    } catch (error) {
      console.error("[Gemini] ===============================");
      console.error("[Gemini] ❌ ERROR");
      console.error("[Gemini] URL:", url);
      console.error("[Gemini] Modelo:", this.model);
      console.error("[Gemini] Tiempo:", `${Date.now() - startedAt} ms`);
      console.error("[Gemini] Error:", error);
      console.error("[Gemini] ===============================");

      throw error;
    }
  }
}
