import type { AIProvider } from "@/domain/ai/ai-provider";
import { OllamaProvider } from "./providers/ollama.provider";
import { LovableGatewayProvider } from "./providers/lovable-gateway.provider";

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

    default:
      throw new Error(
        `AI_PROVIDER="${kind}" desconocido. Valores soportados: "ollama" | "lovable".`,
      );
  }

  return cachedProvider;
}

/** Solo para tests: limpia el provider cacheado entre casos. */
export function resetAIProviderCache(): void {
  cachedProvider = undefined;
}
