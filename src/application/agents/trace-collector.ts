import type { TraceStep } from "@/domain/agents/agent.types";

const MAX_STRING = 2500;

export function truncateForTrace(value: unknown, maxString = MAX_STRING): unknown {
  if (typeof value === "string") {
    return value.length > maxString
      ? `${value.slice(0, maxString)}…[recortado, ${value.length - maxString} caracteres más]`
      : value;
  }
  if (Array.isArray(value)) return value.map((v) => truncateForTrace(v, maxString));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = truncateForTrace(v, maxString);
    }
    return out;
  }
  return value ?? null;
}

export type NewStep = Omit<TraceStep, "idx" | "at">;

export class TraceCollector {
  private readonly steps: TraceStep[] = [];
  private charsIn = 0;
  private charsOut = 0;

  constructor(private readonly now: () => number = Date.now) {}

  add(step: NewStep): TraceStep {
    const full: TraceStep = {
      ...step,
      input: truncateForTrace(step.input),
      output: truncateForTrace(step.output),
      idx: this.steps.length,
      at: new Date(this.now()).toISOString(),
    };
    this.steps.push(full);
    return full;
  }

  addChars(input: number, output: number): void {
    this.charsIn += input;
    this.charsOut += output;
  }

  list(): TraceStep[] {
    return [...this.steps];
  }

  stats() {
    return {
      llmCalls: this.steps.filter((s) => s.kind === "llm").length,
      toolCalls: this.steps.filter((s) => s.kind === "tool" || s.kind === "delegate").length,
      approxTokensIn: Math.ceil(this.charsIn / 4),
      approxTokensOut: Math.ceil(this.charsOut / 4),
    };
  }
}
