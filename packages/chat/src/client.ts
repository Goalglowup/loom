import type { RagSource } from './types.js';

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  conversation_id?: string;
  partition_id?: string;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
      reasoning?: string;
    };
  }>;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  conversation_id?: string;
  rag_sources?: RagSource[];
}

export async function sendChatCompletion(
  baseUrl: string,
  apiKey: string,
  request: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  const url = `${baseUrl}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message ?? data.error ?? `Request failed (${res.status})`);
  }

  return data as ChatCompletionResponse;
}
