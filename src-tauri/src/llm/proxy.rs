use std::sync::Arc;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;

use crate::error::HyperCroissantError;

use super::keychain::{KeychainBackend, OsKeychainBackend};

const PROVIDER_OPENAI: &str = "openai";
const PROVIDER_ANTHROPIC: &str = "anthropic";
const PROVIDER_OLLAMA: &str = "ollama";

const ANTHROPIC_VERSION: &str = "2023-06-01";
const ANTHROPIC_MAX_TOKENS: u32 = 4096;

pub struct LlmState {
    keychain: Arc<dyn KeychainBackend>,
    client: reqwest::Client,
}

impl LlmState {
    pub fn new() -> Self {
        Self {
            keychain: Arc::new(OsKeychainBackend),
            client: reqwest::Client::new(),
        }
    }

    #[cfg(test)]
    pub fn with_keychain(keychain: Arc<dyn KeychainBackend>) -> Self {
        Self {
            keychain,
            client: reqwest::Client::new(),
        }
    }

    pub fn keychain(&self) -> &dyn KeychainBackend {
        self.keychain.as_ref()
    }
}

impl Default for LlmState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatRequest {
    pub provider: String,
    pub model: String,
    pub system_prompt: String,
    pub messages: Vec<LlmMessage>,
    pub base_url: Option<String>,
    #[serde(default)]
    pub stream: bool,
}

pub fn default_base_url(provider: &str) -> &'static str {
    match provider {
        PROVIDER_OPENAI => "https://api.openai.com/v1",
        PROVIDER_ANTHROPIC => "https://api.anthropic.com/v1",
        PROVIDER_OLLAMA => "http://localhost:11434",
        _ => "",
    }
}

fn provider_needs_key(provider: &str) -> bool {
    matches!(provider, PROVIDER_OPENAI | PROVIDER_ANTHROPIC)
}

fn build_request_body(request: &LlmChatRequest, stream: bool) -> Value {
    match request.provider.as_str() {
        PROVIDER_ANTHROPIC => json!({
            "model": request.model,
            "system": request.system_prompt,
            "messages": request.messages,
            "max_tokens": ANTHROPIC_MAX_TOKENS,
            "stream": stream,
        }),
        _ => {
            let mut messages = vec![json!({ "role": "system", "content": request.system_prompt })];
            for m in &request.messages {
                messages.push(json!({ "role": m.role, "content": m.content }));
            }
            json!({
                "model": request.model,
                "messages": messages,
                "stream": stream,
            })
        }
    }
}

fn endpoint_url(provider: &str, base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    match provider {
        PROVIDER_ANTHROPIC => format!("{base}/messages"),
        PROVIDER_OLLAMA => format!("{base}/api/chat"),
        _ => format!("{base}/chat/completions"),
    }
}

pub async fn chat(
    state: &LlmState,
    request: &LlmChatRequest,
    on_chunk: Option<&Channel<String>>,
) -> Result<String, HyperCroissantError> {
    let stream = on_chunk.is_some();
    let base_url = request
        .base_url
        .clone()
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| default_base_url(&request.provider).to_string());

    let api_key = if provider_needs_key(&request.provider) {
        Some(state.keychain.load(&request.provider)?.ok_or_else(|| {
            HyperCroissantError::KeychainError(format!(
                "No API key stored for provider '{}'",
                request.provider
            ))
        })?)
    } else {
        None
    };

    let url = endpoint_url(&request.provider, &base_url);
    let body = build_request_body(request, stream);

    let mut builder = state.client.post(&url).json(&body);
    if let Some(key) = api_key {
        builder = match request.provider.as_str() {
            PROVIDER_ANTHROPIC => builder
                .header("x-api-key", key)
                .header("anthropic-version", ANTHROPIC_VERSION),
            _ => builder.bearer_auth(key),
        };
    }

    let response = builder
        .send()
        .await
        .map_err(|e| HyperCroissantError::LlmError(e.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(HyperCroissantError::LlmError(format!(
            "{} returned HTTP {}: {}",
            request.provider, status, text
        )));
    }

    match on_chunk {
        Some(channel) => stream_response(&request.provider, response, channel).await,
        None => {
            let body: Value = response
                .json()
                .await
                .map_err(|e| HyperCroissantError::LlmError(e.to_string()))?;
            extract_full_text(&request.provider, &body)
        }
    }
}

async fn stream_response(
    provider: &str,
    response: reqwest::Response,
    channel: &Channel<String>,
) -> Result<String, HyperCroissantError> {
    let mut byte_stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full = String::new();

    while let Some(chunk) = byte_stream.next().await {
        let chunk = chunk.map_err(|e| HyperCroissantError::LlmError(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        for delta in drain_frames(provider, &mut buffer) {
            full.push_str(&delta);
            let _ = channel.send(delta);
        }
    }
    // Flush any trailing frame not terminated by a delimiter.
    for delta in drain_frames(provider, &mut buffer) {
        full.push_str(&delta);
        let _ = channel.send(delta);
    }
    if !buffer.trim().is_empty() {
        if let Some(delta) = parse_frame(provider, buffer.trim()) {
            full.push_str(&delta);
            let _ = channel.send(delta);
        }
    }
    Ok(full)
}

/// Pulls complete frames out of `buffer`, returning text deltas.
/// SSE providers (openai/anthropic) frame on blank lines; ollama uses NDJSON.
fn drain_frames(provider: &str, buffer: &mut String) -> Vec<String> {
    let mut deltas = Vec::new();
    let separator = if provider == PROVIDER_OLLAMA {
        "\n"
    } else {
        "\n\n"
    };
    while let Some(pos) = buffer.find(separator) {
        let frame = buffer[..pos].to_string();
        buffer.drain(..pos + separator.len());
        if provider == PROVIDER_OLLAMA {
            if let Some(delta) = parse_frame(provider, frame.trim()) {
                deltas.push(delta);
            }
        } else {
            for payload in extract_sse_payloads(&frame) {
                if let Some(delta) = parse_frame(provider, &payload) {
                    deltas.push(delta);
                }
            }
        }
    }
    deltas
}

fn extract_sse_payloads(event: &str) -> Vec<String> {
    let data = event
        .lines()
        .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
        .collect::<Vec<_>>()
        .join("");
    if data.is_empty() {
        Vec::new()
    } else {
        vec![data]
    }
}

fn parse_frame(provider: &str, payload: &str) -> Option<String> {
    match provider {
        PROVIDER_OPENAI => parse_openai_delta(payload),
        PROVIDER_ANTHROPIC => parse_anthropic_delta(payload),
        PROVIDER_OLLAMA => parse_ollama_delta(payload),
        _ => None,
    }
}

fn parse_openai_delta(payload: &str) -> Option<String> {
    if payload == "[DONE]" {
        return None;
    }
    let json: Value = serde_json::from_str(payload).ok()?;
    json["choices"][0]["delta"]["content"]
        .as_str()
        .map(str::to_string)
}

fn parse_anthropic_delta(payload: &str) -> Option<String> {
    let json: Value = serde_json::from_str(payload).ok()?;
    if json["type"].as_str()? == "content_block_delta" {
        json["delta"]["text"].as_str().map(str::to_string)
    } else {
        None
    }
}

fn parse_ollama_delta(payload: &str) -> Option<String> {
    let json: Value = serde_json::from_str(payload).ok()?;
    json["message"]["content"].as_str().map(str::to_string)
}

fn extract_full_text(provider: &str, body: &Value) -> Result<String, HyperCroissantError> {
    let text = match provider {
        PROVIDER_ANTHROPIC => body["content"]
            .as_array()
            .map(|blocks| {
                blocks
                    .iter()
                    .filter(|b| b["type"].as_str() == Some("text"))
                    .filter_map(|b| b["text"].as_str())
                    .collect::<String>()
            })
            .filter(|s| !s.is_empty()),
        PROVIDER_OLLAMA => body["message"]["content"].as_str().map(str::to_string),
        _ => body["choices"][0]["message"]["content"]
            .as_str()
            .map(str::to_string),
    };
    text.ok_or_else(|| {
        HyperCroissantError::LlmError(format!(
            "Could not extract text from {} response: {}",
            provider, body
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::keychain::MockKeychainBackend;

    fn sample_request(provider: &str) -> LlmChatRequest {
        LlmChatRequest {
            provider: provider.to_string(),
            model: "test-model".to_string(),
            system_prompt: "You are a coach.".to_string(),
            messages: vec![
                LlmMessage {
                    role: "user".to_string(),
                    content: "Why Nf5?".to_string(),
                },
                LlmMessage {
                    role: "assistant".to_string(),
                    content: "It attacks h6.".to_string(),
                },
            ],
            base_url: None,
            stream: false,
        }
    }

    #[test]
    fn test_default_base_urls() {
        assert_eq!(default_base_url("openai"), "https://api.openai.com/v1");
        assert_eq!(default_base_url("anthropic"), "https://api.anthropic.com/v1");
        assert_eq!(default_base_url("ollama"), "http://localhost:11434");
    }

    #[test]
    fn test_openai_body_prepends_system_message() {
        let body = build_request_body(&sample_request("openai"), true);
        assert_eq!(body["model"], "test-model");
        assert_eq!(body["stream"], true);
        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[0]["content"], "You are a coach.");
        assert_eq!(messages[1]["role"], "user");
    }

    #[test]
    fn test_anthropic_body_uses_system_field() {
        let body = build_request_body(&sample_request("anthropic"), false);
        assert_eq!(body["system"], "You are a coach.");
        assert_eq!(body["max_tokens"], ANTHROPIC_MAX_TOKENS);
        assert_eq!(body["stream"], false);
        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["role"], "user");
    }

    #[test]
    fn test_ollama_body_shape() {
        let body = build_request_body(&sample_request("ollama"), true);
        assert_eq!(body["messages"].as_array().unwrap().len(), 3);
        assert_eq!(body["stream"], true);
    }

    #[test]
    fn test_endpoint_urls() {
        assert_eq!(
            endpoint_url("openai", "https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint_url("anthropic", "https://api.anthropic.com/v1/"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            endpoint_url("ollama", "http://localhost:11434"),
            "http://localhost:11434/api/chat"
        );
    }

    #[test]
    fn test_parse_openai_sse_stream() {
        let mut buffer = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
            "data: [DONE]\n\n"
        )
        .to_string();
        let deltas = drain_frames("openai", &mut buffer);
        assert_eq!(deltas, vec!["Hello".to_string(), " world".to_string()]);
        assert!(buffer.is_empty());
    }

    #[test]
    fn test_parse_openai_sse_ignores_role_only_delta() {
        let payload = "{\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}";
        assert_eq!(parse_openai_delta(payload), None);
    }

    #[test]
    fn test_parse_openai_partial_frame_waits() {
        let mut buffer = "data: {\"choices\":[{\"delta\":{\"content\":\"Hel".to_string();
        assert!(drain_frames("openai", &mut buffer).is_empty());
        buffer.push_str("lo\"}}]}\n\n");
        assert_eq!(drain_frames("openai", &mut buffer), vec!["Hello".to_string()]);
    }

    #[test]
    fn test_parse_anthropic_sse_stream() {
        let mut buffer = concat!(
            "event: message_start\n",
            "data: {\"type\":\"message_start\",\"message\":{}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Nf5\"}}\n\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\" attacks\"}}\n\n"
        )
        .to_string();
        let deltas = drain_frames("anthropic", &mut buffer);
        assert_eq!(deltas, vec!["Nf5".to_string(), " attacks".to_string()]);
    }

    #[test]
    fn test_parse_ollama_ndjson_stream() {
        let mut buffer = concat!(
            "{\"message\":{\"role\":\"assistant\",\"content\":\"Play \"},\"done\":false}\n",
            "{\"message\":{\"role\":\"assistant\",\"content\":\"Nf5\"},\"done\":false}\n"
        )
        .to_string();
        let deltas = drain_frames("ollama", &mut buffer);
        assert_eq!(deltas, vec!["Play ".to_string(), "Nf5".to_string()]);
    }

    #[test]
    fn test_extract_full_text_openai() {
        let body = json!({"choices":[{"message":{"content":"Because h6."}}]});
        assert_eq!(extract_full_text("openai", &body).unwrap(), "Because h6.");
    }

    #[test]
    fn test_extract_full_text_anthropic() {
        let body = json!({"content":[{"type":"text","text":"Part one. "},{"type":"text","text":"Part two."}]});
        assert_eq!(
            extract_full_text("anthropic", &body).unwrap(),
            "Part one. Part two."
        );
    }

    #[test]
    fn test_extract_full_text_ollama() {
        let body = json!({"message":{"role":"assistant","content":"Done."},"done":true});
        assert_eq!(extract_full_text("ollama", &body).unwrap(), "Done.");
    }

    #[test]
    fn test_extract_full_text_malformed_errors() {
        let body = json!({"unexpected": true});
        assert!(extract_full_text("openai", &body).is_err());
    }

    #[test]
    fn test_state_with_mock_keychain() {
        let keychain = Arc::new(MockKeychainBackend::new());
        keychain.save("openai", "sk-stored").unwrap();
        let state = LlmState::with_keychain(keychain);
        assert_eq!(
            state.keychain().load("openai").unwrap(),
            Some("sk-stored".into())
        );
    }

    #[test]
    fn test_deserialize_camel_case_request() {
        let json = json!({
            "provider": "openai",
            "model": "gpt-4o",
            "systemPrompt": "sys",
            "messages": [{"role": "user", "content": "hi"}],
            "baseUrl": "http://localhost:8080"
        });
        let request: LlmChatRequest = serde_json::from_value(json).unwrap();
        assert_eq!(request.system_prompt, "sys");
        assert_eq!(request.base_url, Some("http://localhost:8080".into()));
    }
}
