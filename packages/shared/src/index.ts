export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ChatRequest {
  prompt: string;
}

export interface ChatResponse {
  text: string;
}
