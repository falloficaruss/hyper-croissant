import type { ExplanationLevel, LLMConfig, ProviderDefinition } from "../types/llm";
import { BUILTIN_PROVIDERS } from "../types/llm";
import { create } from "zustand";

const STORAGE_KEY = "hyper-croissant-settings";

interface PersistedSettings {
  provider: string;
  model: string;
  baseUrl: string;
  explanationLevel: ExplanationLevel;
}

function loadPersisted(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedSettings;
  } catch {
    // ignore
  }
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "",
    explanationLevel: "intermediate",
  };
}

function savePersisted(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

interface SettingsState {
  // LLM configuration
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  explanationLevel: ExplanationLevel;

  // UI state
  settingsOpen: boolean;

  // Actions
  setProvider: (id: string) => void;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setBaseUrl: (url: string) => void;
  setExplanationLevel: (level: ExplanationLevel) => void;
  setSettingsOpen: (open: boolean) => void;

  // Derived
  getProviderDefinition: () => ProviderDefinition | undefined;
  getLLMConfig: () => LLMConfig;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const persisted = loadPersisted();

  const determineModel = (providerId: string): string => {
    // If the persisted model works with the new provider, keep it
    const def = BUILTIN_PROVIDERS.find((p) => p.id === providerId);
    if (def && def.models.includes(persisted.model)) return persisted.model;
    return def?.models[0] ?? "";
  };

  return {
    provider: persisted.provider,
    apiKey: "",
    model: determineModel(persisted.provider),
    baseUrl: persisted.baseUrl,
    explanationLevel: persisted.explanationLevel,
    settingsOpen: false,

    setProvider: (id: string) => {
      const current = get();
      const newModel = determineModel(id);
      set({ provider: id, model: newModel, apiKey: "" });
      savePersisted({
        provider: id,
        model: newModel,
        baseUrl: current.baseUrl,
        explanationLevel: current.explanationLevel,
      });
    },

    setApiKey: (key: string) => set({ apiKey: key }),

    setModel: (model: string) => {
      const current = get();
      set({ model });
      savePersisted({
        provider: current.provider,
        model,
        baseUrl: current.baseUrl,
        explanationLevel: current.explanationLevel,
      });
    },

    setBaseUrl: (url: string) => {
      const current = get();
      set({ baseUrl: url });
      savePersisted({
        provider: current.provider,
        model: current.model,
        baseUrl: url,
        explanationLevel: current.explanationLevel,
      });
    },

    setExplanationLevel: (level: ExplanationLevel) => {
      const current = get();
      set({ explanationLevel: level });
      savePersisted({
        provider: current.provider,
        model: current.model,
        baseUrl: current.baseUrl,
        explanationLevel: level,
      });
    },

    setSettingsOpen: (open: boolean) => set({ settingsOpen: open }),

    getProviderDefinition: () => {
      return BUILTIN_PROVIDERS.find((p) => p.id === get().provider);
    },

    getLLMConfig: () => {
      const state = get();
      return {
        provider: state.provider,
        apiKey: state.apiKey || undefined,
        model: state.model,
        baseUrl: state.baseUrl || undefined,
      };
    },
  };
});
