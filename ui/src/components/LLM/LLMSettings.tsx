import { useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { BUILTIN_PROVIDERS } from "../../types/llm";
import { deleteApiKey, hasApiKey, saveApiKey } from "../../lib/tauri";

export function LLMSettings() {
  const provider = useSettingsStore((s) => s.provider);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const model = useSettingsStore((s) => s.model);
  const baseUrl = useSettingsStore((s) => s.baseUrl);
  const useProxy = useSettingsStore((s) => s.useProxy);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const setProvider = useSettingsStore((s) => s.setProvider);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const setModel = useSettingsStore((s) => s.setModel);
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl);
  const setUseProxy = useSettingsStore((s) => s.setUseProxy);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);

  const providerDef = BUILTIN_PROVIDERS.find((p) => p.id === provider);
  const models = providerDef?.models ?? [];

  const [keyInput, setKeyInput] = useState("");
  const [keyStored, setKeyStored] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const showKeychainKey = useProxy && providerDef?.requiresApiKey === true;

  useEffect(() => {
    if (!showKeychainKey) return;
    let cancelled = false;
    hasApiKey(provider)
      .then((stored) => {
        if (!cancelled) setKeyStored(stored);
      })
      .catch(() => {
        if (!cancelled) setKeyStored(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showKeychainKey, provider]);

  const handleProviderChange = (id: string) => {
    setKeyInput("");
    setKeyError(null);
    setProvider(id);
  };

  const handleProxyChange = (checked: boolean) => {
    setKeyInput("");
    setKeyError(null);
    setUseProxy(checked);
  };

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    try {
      await saveApiKey(provider, keyInput.trim());
      setKeyInput("");
      setKeyStored(true);
      setKeyError(null);
    } catch (e) {
      setKeyError(String(e));
    }
  };

  const handleRemoveKey = async () => {
    try {
      await deleteApiKey(provider);
      setKeyStored(false);
      setKeyError(null);
    } catch (e) {
      setKeyError(String(e));
    }
  };

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
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {BUILTIN_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* Rust proxy toggle */}
          <label className="llm-settings-field llm-settings-checkbox">
            <input
              type="checkbox"
              checked={useProxy}
              onChange={(e) => handleProxyChange(e.target.checked)}
            />
            <span className="llm-settings-label">
              Use Rust proxy{" "}
              <span className="llm-settings-optional">
                (API key stays in OS keychain)
              </span>
            </span>
          </label>

          {/* API Key — in-memory when direct, OS keychain when proxied */}
          {providerDef?.requiresApiKey && !showKeychainKey && (
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

          {showKeychainKey && (
            <div className="llm-settings-field">
              <span className="llm-settings-label">API Key</span>
              {keyStored ? (
                <div className="llm-settings-keyrow">
                  <span className="llm-settings-keystored">
                    ✓ Stored in OS keychain
                  </span>
                  <button
                    className="llm-settings-button"
                    type="button"
                    onClick={handleRemoveKey}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="llm-settings-keyrow">
                  <input
                    className="llm-settings-input"
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="sk-..."
                  />
                  <button
                    className="llm-settings-button"
                    type="button"
                    onClick={handleSaveKey}
                    disabled={!keyInput.trim()}
                  >
                    Save
                  </button>
                </div>
              )}
              {keyError && <span className="llm-settings-keyerror">{keyError}</span>}
            </div>
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
