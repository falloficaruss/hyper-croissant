import type { ChatParams, LLMProviderImpl } from "../../types/llm";

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChunk {
  done: boolean;
  message?: { content: string };
  error?: string;
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
    throw new Error(`Ollama API error (${response.status}): ${text}`);
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
      if (!trimmed) continue;

      try {
        const json = JSON.parse(trimmed) as OllamaChunk;
        if (json.error) throw new Error(json.error);
        if (json.message?.content) {
          yield json.message.content;
        }
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
    throw new Error(`Ollama API error (${response.status}): ${text}`);
  }

  const data = await response.json() as {
    message: { content: string };
  };
  return data.message?.content ?? "";
}

export function createOllamaProvider(): LLMProviderImpl {
  return {
    info: {
      id: "ollama",
      name: "Ollama",
      requiresApiKey: false,
      models: ["llama3", "mistral", "codellama"],
      supportsStreaming: true,
    },
    chat: async (params: ChatParams): Promise<string> => {
      const url = `${params.baseUrl ?? "http://localhost:11434"}/api/chat`;

      const messages: OllamaMessage[] = [
        { role: "system", content: params.systemPrompt },
        ...params.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const body: Record<string, unknown> = {
        model: params.model,
        messages,
        stream: params.onChunk !== undefined,
      };

      if (params.onChunk) {
        let full = "";
        for await (const chunk of streamChat(url, body, params.signal)) {
          full += chunk;
          params.onChunk(chunk);
        }
        return full;
      }

      return nonStreamChat(url, body, params.signal);
    },
  };
}
