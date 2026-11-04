import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/infrastructure/supabase/cron-auth";

const STARTED_AT = Date.now();

type CheckState = "ok" | "down" | "missing_config" | "skipped";

async function timedFetch(url: string, init: RequestInit, ms: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function checkSupabase(): Promise<CheckState> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return "missing_config";
  return (await timedFetch(
    `${url.replace(/\/+$/, "")}/auth/v1/health`,
    { headers: { apikey: key } },
    3000,
  ))
    ? "ok"
    : "down";
}

function aiConfig(): { provider: string; configured: boolean } {
  const provider = (process.env["AI_PROVIDER"] ?? "ollama").trim().toLowerCase();
  if (provider === "openai")
    return { provider, configured: Boolean(process.env["OPENAI_API_KEY"]) };
  if (provider === "lovable")
    return { provider, configured: Boolean(process.env["LOVABLE_API_KEY"]) };
  if (provider === "ollama") return { provider, configured: true };
  return { provider, configured: false };
}

async function pingAi(provider: string): Promise<CheckState> {
  if (provider === "ollama") {
    const base = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
    return (await timedFetch(`${base.replace(/\/+$/, "")}/api/tags`, {}, 4000)) ? "ok" : "down";
  }
  if (provider === "openai") {
    const base = (process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1").replace(
      /\/+$/,
      "",
    );
    const key = process.env["OPENAI_API_KEY"] ?? "";
    return (await timedFetch(
      `${base}/models`,
      { headers: { Authorization: `Bearer ${key}` } },
      4000,
    ))
      ? "ok"
      : "down";
  }
  return "skipped";
}

async function health(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const wantsDeep = url.searchParams.get("deep") === "1";

  const supabase = await checkSupabase();
  const ai = aiConfig();
  const checks: Record<string, unknown> = {
    app: "ok",
    supabase,
    ai: { provider: ai.provider, configured: ai.configured },
    email: { provider: (process.env["EMAIL_PROVIDER"] ?? "console").trim().toLowerCase() },
  };

  if (wantsDeep) {
    if (!process.env["LOVABLE_CRON_SECRET"] && process.env["CRON_SECRET"]) {
      process.env["LOVABLE_CRON_SECRET"] = process.env["CRON_SECRET"];
    }
    const rejected = await authenticateCronRequest(request);
    if (rejected) return rejected;
    (checks["ai"] as Record<string, unknown>)["reachable"] = ai.configured
      ? await pingAi(ai.provider)
      : "skipped";
  }

  const aiReachableDown = (checks["ai"] as Record<string, unknown>)["reachable"] === "down";
  const healthy =
    supabase !== "down" && supabase !== "missing_config" && ai.configured && !aiReachableDown;

  return new Response(
    JSON.stringify({
      status: healthy ? "ok" : "degraded",
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      checks,
    }),
    {
      status: healthy ? 200 : 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: ({ request }) => health(request),
    },
  },
});
