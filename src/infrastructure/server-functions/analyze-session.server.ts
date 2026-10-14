import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/infrastructure/supabase/auth-middleware";
import { z } from "zod";
import { diagnosePostureSession } from "@/application/ai/diagnose-posture-session.usecase";
import { getAIProvider } from "@/infrastructure/ai/ai-provider.factory";

const Input = z.object({
  locale: z.enum(["es", "en"]),
  durationSeconds: z.number(),
  goodPosturePct: z.number(),
  avgNeckAngle: z.number(),
  avgTorsoAngle: z.number(),
  alertsCount: z.number(),
  score: z.number(),
  department: z.string().optional(),
});

export const analyzeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const provider = getAIProvider();
    return diagnosePostureSession(provider, data);
  });
