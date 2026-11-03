import type { ChatMessage } from "@/domain/ai/ai-provider";
import type { AgentName, AgentToolDef } from "@/domain/agents/agent.types";
import { parseAction } from "./json-protocol";
import type { LlmClient } from "./llm-client";
import { DeadlineExceededError } from "./resilience";
import type { TraceCollector } from "./trace-collector";

export class AgentLoopError extends Error {
  constructor(agent: AgentName, detail: string) {
    super(`Agente ${agent}: ${detail}`);
    this.name = "AgentLoopError";
  }
}

export interface AgentLoopOptions<F> {
  agent: AgentName;
  depth: number;
  system: string;
  goal: string;
  tools: AgentToolDef[];
  llm: LlmClient;
  trace: TraceCollector;
  maxSteps: number;
  parseFinal: (output: unknown) => F;
  seedMessages?: ChatMessage[];
  now?: () => number;
}

export interface AgentLoopResult<F> {
  final: F;
  steps: number;
  forced: boolean;
  messages: ChatMessage[];
}

const MAX_OBSERVATION_CHARS = 3000;
const MAX_SAME_CALL = 2;

function observation(label: string, payload: unknown): string {
  let text: string;
  try {
    text = typeof payload === "string" ? payload : JSON.stringify(payload);
  } catch {
    text = String(payload);
  }
  if (text.length > MAX_OBSERVATION_CHARS) text = `${text.slice(0, MAX_OBSERVATION_CHARS)}…`;
  return `OBSERVATION from ${label}: ${text}`;
}

export async function runAgentLoop<F>(opts: AgentLoopOptions<F>): Promise<AgentLoopResult<F>> {
  const { agent, depth, tools, llm, trace, maxSteps } = opts;
  const now = opts.now ?? Date.now;
  const messages: ChatMessage[] = opts.seedMessages
    ? [...opts.seedMessages, { role: "user", content: opts.goal }]
    : [
        { role: "system", content: opts.system },
        { role: "user", content: opts.goal },
      ];
  const callCounts = new Map<string, number>();

  for (let step = 1; step <= maxSteps + 1; step++) {
    const forced = step > maxSteps;
    if (forced) {
      messages.push({
        role: "user",
        content:
          'STEP LIMIT REACHED. Do not call tools anymore. Reply now with {"action":"final","output":...} using what you already know.',
      });
    }

    const raw = await llm.complete(agent, depth, messages);
    messages.push({ role: "assistant", content: raw });

    let action;
    try {
      action = parseAction(raw);
    } catch (e) {
      messages.push({
        role: "user",
        content: `ERROR: invalid response (${e instanceof Error ? e.message.slice(0, 200) : "parse error"}). Reply with exactly one JSON object following the protocol.`,
      });
      continue;
    }

    if (action.action === "final") {
      try {
        const final = opts.parseFinal(action.output);
        return { final, steps: step, forced, messages };
      } catch (e) {
        messages.push({
          role: "user",
          content: `ERROR: invalid final output (${e instanceof Error ? e.message.slice(0, 200) : "invalid"}). Fix it and reply again with {"action":"final","output":...}.`,
        });
        continue;
      }
    }

    // action === "tool"
    if (forced) {
      messages.push({
        role: "user",
        content: "ERROR: tools are no longer available. Give the final output.",
      });
      continue;
    }

    const tool = tools.find((t) => t.name === action.tool);
    if (!tool) {
      messages.push({
        role: "user",
        content: `ERROR: unknown tool "${action.tool}". Available tools: ${tools.map((t) => t.name).join(", ")}.`,
      });
      continue;
    }

    const key = `${tool.name}:${JSON.stringify(action.args)}`;
    const seen = (callCounts.get(key) ?? 0) + 1;
    callCounts.set(key, seen);
    if (seen > MAX_SAME_CALL) {
      messages.push({
        role: "user",
        content: `ERROR: you already called ${tool.name} with the same arguments. Use the previous result and continue or finish.`,
      });
      continue;
    }

    const startedAt = now();
    try {
      const result = await tool.run(action.args);
      trace.add({
        agent,
        kind: tool.kind ?? "tool",
        name: tool.name,
        depth,
        ok: true,
        input: action.args,
        output: result,
        durationMs: now() - startedAt,
      });
      messages.push({ role: "user", content: observation(tool.name, result) });
    } catch (e) {
      if (e instanceof DeadlineExceededError) throw e;
      const message = e instanceof Error ? e.message : String(e);
      trace.add({
        agent,
        kind: tool.kind ?? "tool",
        name: tool.name,
        depth,
        ok: false,
        input: action.args,
        output: null,
        error: message,
        durationMs: now() - startedAt,
      });
      messages.push({ role: "user", content: observation(tool.name, { error: message }) });
    }
  }

  throw new AgentLoopError(agent, `no produjo una salida final válida tras ${maxSteps} pasos`);
}
