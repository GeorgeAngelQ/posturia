import type { AIProvider } from "@/domain/ai/ai-provider";
import { OllamaProvider } from "./providers/ollama.provider";
import { LovableGatewayProvider } from "./providers/lovable-gateway.provider";
import { GrokProvider } from "./providers/grok.provider";
import { GeminiProvider } from "./providers/gemini.provider";

let cachedProvider: AIProvider | undefined;

export function getAIProvider(): AIProvider {
  console.log("[AI Factory] getAIProvider() llamado");

  if (cachedProvider) return cachedProvider;

  const kind = (process.env["AI_PROVIDER"] ?? "ollama").trim().toLowerCase();
  console.log("[AI Factory] Configuración detectada:", {
    AI_PROVIDER: kind,
  });
  switch (kind) {
    case "ollama": {
      const baseUrl = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
      const model = process.env["OLLAMA_MODEL"] ?? "qwen3.8";

      console.log("[Ollama] Inicializando provider...");
      console.log("[Ollama] Base URL:", baseUrl);
      console.log("[Ollama] Modelo:", model);
      cachedProvider = new OllamaProvider({
        baseUrl: process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
        model: process.env["OLLAMA_MODEL"] ?? "qwen3.8",
      });
      break;
    }

    case "lovable": {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) {
        throw new Error(
          'AI_PROVIDER="lovable" pero falta LOVABLE_API_KEY en el .env. ' +
            'Usa AI_PROVIDER="ollama" para correr con IA local, o define esa key.',
        );
      }
      cachedProvider = new LovableGatewayProvider({
        apiKey,
        model: process.env["LOVABLE_AI_MODEL"],
      });
      break;
    }
    case "grok": {
      const apiKey = process.env["XAI_API_KEY"];
      if (!apiKey) {
        throw new Error('AI_PROVIDER="GROK" pero falta GROK_KEY.');
      }
      cachedProvider = new GrokProvider({
        apiKey,
        model: process.env["XAI_MODEL"] ?? "grok-4.1",
      });
      break;
    }

    case "gemini": {
      const apiKey = process.env["GEMINI_API_KEY"];

      if (!apiKey) {
        throw new Error('AI_PROVIDER="gemini" pero falta GEMINI_API_KEY.');
      }

      const model = process.env["GEMINI_MODEL"] ?? "gemini-3.8-flash";

      console.log("[AI Factory] Inicializando Gemini...");

      cachedProvider = new GeminiProvider({
        apiKey,
        model,
        maxOutputTokens: Number(process.env["GEMINI_MAX_OUTPUT_TOKENS"] ?? 2048),
        thinkingLevel: "LOW",
      });

      break;
    }

    default:
      throw new Error(
        `AI_PROVIDER="${kind}" desconocido. Valores soportados: "ollama" | "lovable" | "grok".`,
      );
  }

  return cachedProvider;
}

/** Solo para tests: limpia el provider cacheado entre casos. */
export function resetAIProviderCache(): void {
  cachedProvider = undefined;
}
