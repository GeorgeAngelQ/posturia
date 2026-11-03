import { z } from "zod";

export const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("tool"),
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()).default({}),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("final"),
    output: z.unknown(),
  }),
]);

export type AgentAction = z.infer<typeof ActionSchema>;

export function stripNoise(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
}

export function extractJson(text: string): unknown {
  const clean = stripNoise(text);
  const start = clean.indexOf("{");
  if (start === -1) throw new Error("No se encontró ningún objeto JSON en la respuesta");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(clean.slice(start, i + 1));
    }
  }
  throw new Error("JSON incompleto en la respuesta");
}

export function parseAction(text: string): AgentAction {
  return ActionSchema.parse(extractJson(text));
}
