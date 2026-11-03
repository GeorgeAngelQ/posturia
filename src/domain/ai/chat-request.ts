import type { ChatMessage, ChatOptions } from "@/domain/ai/ai-provider";

export function buildChatBody(
  model: string,
  messages: ChatMessage[],
  options?: ChatOptions,
): Record<string, unknown> {
  return {
    model,
    messages,
    stream: false,
    ...(options?.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
  };
}

export function signalInit(options?: ChatOptions): { signal?: AbortSignal } {
  return options?.signal ? { signal: options.signal } : {};
}
