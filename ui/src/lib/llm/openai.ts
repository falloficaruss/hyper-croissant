import type { ChatParams, LLMProviderImpl } from "../../types/llm";

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChunk {
  choices?: {
    delta: { content?: string };
    finish_reason: string | null;
  }[];
}

async function* streamChat(
  url: string,
  body: object,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6)) as OpenAIChunk;
        const content = json.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // skip malformed chunks
      }
    }
  }
}

async function nonStreamChat(
  url: string,
  body: object,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${text}`);
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

export function createOpenAIProvider(): LLMProviderImpl {
  return {
    info: {
      id: "openai",
      name: "OpenAI",
      requiresApiKey: true,
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
      supportsStreaming: true,
    },
    chat: async (params: ChatParams): Promise<string> => {
      const url = `${params.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`;

      const messages: OpenAIMessage[] = [
        { role: "system", content: params.systemPrompt },
        ...params.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const body: Record<string, unknown> = {
        model: params.model,
        messages,
        stream: params.onChunk !== undefined,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (params.apiKey) {
        headers["Authorization"] = `Bearer ${params.apiKey}`;
      }

      if (params.onChunk) {
        let full = "";
        for await (const chunk of streamChat(url, { ...body, headers }, params.signal)) {
          full += chunk;
          params.onChunk(chunk);
        }
        return full;
      }

      return nonStreamChat(url, { ...body, headers }, params.signal);
    },
  };
}
