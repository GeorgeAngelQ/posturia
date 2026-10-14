/**
 * Ejemplo de cómo testear el caso de uso SIN red ni Ollama, gracias a la
 * inyección de dependencias por interfaz. Referencia ejecutable con:
 *   npx tsx src/application/ai/__tests__/diagnose-posture-session.example.ts
 */
import type { AIProvider } from "@/domain/ai/ai-provider";
import type { ChatMessage } from "@/domain/ai/ai-provider";
import { diagnosePostureSession } from "@/application/ai/diagnose-posture-session.usecase";

class FakeAIProvider implements AIProvider {
  readonly name = "fake";
  calls: ChatMessage[][] = [];

  async chat(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    return this.calls.length === 1
      ? "Diagnóstico simulado: leve inclinación cervical."
      : "Recomendación simulada: 1. Ajusta el monitor a la altura de los ojos.";
  }
}

async function main() {
  const fake = new FakeAIProvider();
  const result = await diagnosePostureSession(fake, {
    locale: "es",
    durationSeconds: 1800,
    goodPosturePct: 72.5,
    avgNeckAngle: 30.2,
    avgTorsoAngle: 8.1,
    alertsCount: 3,
    score: 78,
    department: "Ingeniería",
  });

  console.assert(fake.calls.length === 2, "debe llamar al provider 2 veces (analista + coach)");
  console.assert(result.diagnosis.includes("cervical"), "debe propagar el diagnóstico");
  console.assert(result.recommendation.includes("monitor"), "debe propagar la recomendación");
  console.log("OK — diagnosePostureSession funciona sin red real, con un AIProvider falso.");
}

main();
