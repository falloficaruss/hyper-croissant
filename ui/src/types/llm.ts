// ── Explanation Level ──

export type ExplanationLevel = "beginner" | "intermediate" | "advanced" | "master";

// ── Messages ──

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Provider Configuration ──

export interface LLMConfig {
  provider: string;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  useProxy?: boolean;
}

// Wire shape for the Rust `llm_chat` command (serde camelCase).
export interface LlmChatRequest {
  provider: string;
  model: string;
  systemPrompt: string;
  messages: LLMMessage[];
  baseUrl?: string;
  stream: boolean;
}

// ── Provider Interface ──

export interface LLMProviderInfo {
  id: string;
  name: string;
  requiresApiKey: boolean;
  models: string[];
  supportsStreaming: boolean;
}

export interface ChatParams {
  systemPrompt: string;
  messages: LLMMessage[];
  model: string;
  baseUrl?: string;
  apiKey?: string;
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

export interface LLMProviderImpl {
  info: LLMProviderInfo;
  chat: (params: ChatParams) => Promise<string>;
}

// ── Explanation Level Metadata ──

export interface ExplanationLevelInfo {
  id: ExplanationLevel;
  label: string;
  description: string;
  minElo: number;
}

export const EXPLANATION_LEVELS: ExplanationLevelInfo[] = [
  {
    id: "beginner",
    label: "Beginner",
    description: "Simple language, focus on 'what' not 'why'. One idea per sentence.",
    minElo: 0,
  },
  {
    id: "intermediate",
    label: "Intermediate",
    description: "Names tactical and positional concepts. Explains 'why' briefly.",
    minElo: 1200,
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "References pawn structure, piece activity, long-term implications.",
    minElo: 1800,
  },
  {
    id: "master",
    label: "Master",
    description: "Full technical analysis with variations.",
    minElo: 2200,
  },
];

// ── Provider Registry ──

export interface ProviderDefinition {
  id: string;
  name: string;
  requiresApiKey: boolean;
  defaultBaseUrl: string;
  models: string[];
  supportsStreaming: boolean;
}

export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
  {
    id: "openai",
    name: "OpenAI",
    requiresApiKey: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    supportsStreaming: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    requiresApiKey: true,
    defaultBaseUrl: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4", "claude-3.5-sonnet", "claude-3-haiku"],
    supportsStreaming: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    requiresApiKey: false,
    defaultBaseUrl: "http://localhost:11434",
    models: ["llama3", "mistral", "codellama"],
    supportsStreaming: true,
  },
];

// ── Conversation ──

export interface ConversationEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface PositionConversation {
  fen: string;
  entries: ConversationEntry[];
}
