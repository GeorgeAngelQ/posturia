
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[]): Promise<string>;
}
