import { useSettingsStore } from "../../stores/settingsStore";
import { BUILTIN_PROVIDERS } from "../../types/llm";

export function LLMSettings() {
  const provider = useSettingsStore((s) => s.provider);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const model = useSettingsStore((s) => s.model);
  const baseUrl = useSettingsStore((s) => s.baseUrl);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const setProvider = useSettingsStore((s) => s.setProvider);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const setModel = useSettingsStore((s) => s.setModel);
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const providerDef = BUILTIN_PROVIDERS.find((p) => p.id === provider);
  const models = providerDef?.models ?? [];

  if (!settingsOpen) return null;

  return (
    <div className="llm-settings-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="llm-settings" onClick={(e) => e.stopPropagation()}>
        <div className="llm-settings-header">
          <h2 className="llm-settings-title">LLM Settings</h2>
          <button
            className="llm-settings-close"
            onClick={() => setSettingsOpen(false)}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="llm-settings-body">
          {/* Provider */}
          <label className="llm-settings-field">
            <span className="llm-settings-label">Provider</span>
            <select
              className="llm-settings-select"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {BUILTIN_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* API Key */}
          {providerDef?.requiresApiKey && (
            <label className="llm-settings-field">
              <span className="llm-settings-label">API Key</span>
              <input
                className="llm-settings-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </label>
          )}

          {/* Model */}
          <label className="llm-settings-field">
            <span className="llm-settings-label">Model</span>
            <select
              className="llm-settings-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          {/* Base URL */}
          <label className="llm-settings-field">
            <span className="llm-settings-label">
              Base URL{" "}
              <span className="llm-settings-optional">(optional)</span>
            </span>
            <input
              className="llm-settings-input"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={providerDef?.defaultBaseUrl ?? ""}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
