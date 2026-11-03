export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  signal?: AbortSignal | undefined;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
}

export interface AIProvider {
  readonly name: string;
  readonly model?: string | undefined;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}
