interface OpenAIChunk {
  choices?: {
    delta: { content?: string };
    finish_reason: string | null;
  }[];
}

export async function* streamChat(
  url: string,
  body: object,
  headers: Record<string, string>,
  signal?: AbortSignal,
  errorLabel = "OpenAI",
): AsyncGenerator<string> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${errorLabel} API error (${response.status}): ${text}`);
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

export async function nonStreamChat(
  url: string,
  body: object,
  headers: Record<string, string>,
  signal?: AbortSignal,
  errorLabel = "OpenAI",
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${errorLabel} API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}
