import type { AIProvider, ChatMessage } from "@/domain/ai/ai-provider";
import type { AgentName } from "@/domain/agents/agent.types";
import { AgentTimeoutError, DeadlineExceededError, withRetry, withTimeout } from "./resilience";
import type { TraceCollector } from "./trace-collector";

export interface LlmClientConfig {
  callTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  temperature: number;
  maxTokens: number;
  deadlineAt: number;
}

export interface LlmClientDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class LlmClient {
  private readonly now: () => number;

  constructor(
    private readonly provider: AIProvider,
    private readonly config: LlmClientConfig,
    private readonly trace: TraceCollector,
    private readonly deps: LlmClientDeps = {},
  ) {
    this.now = deps.now ?? Date.now;
  }

  get remainingMs(): number {
    return this.config.deadlineAt - this.now();
  }

  async complete(agent: AgentName, depth: number, messages: ChatMessage[]): Promise<string> {
    const startedAt = this.now();
    const chars = messages.reduce((n, m) => n + m.content.length, 0);
    try {
      const text = await withRetry(
        async () => {
          const remaining = this.remainingMs;
          if (remaining <= 0) throw new DeadlineExceededError();
          const raw = await withTimeout(
            (signal) =>
              this.provider.chat(messages, {
                signal,
                maxTokens: this.config.maxTokens,
                temperature: this.config.temperature,
              }),
            Math.min(this.config.callTimeoutMs, remaining),
            `${agent} → ${this.provider.name}`,
          );
          if (!raw.trim()) throw new Error("El modelo devolvió una respuesta vacía");
          return raw;
        },
        {
          retries: this.config.maxRetries,
          baseDelayMs: this.config.retryBaseDelayMs,
          shouldRetry: (e) => !(e instanceof DeadlineExceededError),
          ...(this.deps.sleep ? { sleep: this.deps.sleep } : {}),
        },
      );
      this.trace.addChars(chars, text.length);
      this.trace.add({
        agent,
        kind: "llm",
        name: this.provider.model ?? this.provider.name,
        depth,
        ok: true,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        output: text,
        durationMs: this.now() - startedAt,
      });
      return text;
    } catch (error) {
      this.trace.addChars(chars, 0);
      this.trace.add({
        agent,
        kind: "llm",
        name: this.provider.model ?? this.provider.name,
        depth,
        ok: false,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        output: null,
        error:
          error instanceof AgentTimeoutError || error instanceof DeadlineExceededError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error),
        durationMs: this.now() - startedAt,
      });
      throw error;
    }
  }
}
