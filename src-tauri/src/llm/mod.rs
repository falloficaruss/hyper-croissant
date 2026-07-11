use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmRequest {
    pub fen: String,
    pub evaluation: String, // e.g. "+1.5" or "M4"
    pub principal_variation: String, // e.g. "e2e4 e7e5"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmResponse {
    pub explanation: String,
}

#[tauri::command]
pub async fn explain_move(request: LlmRequest) -> Result<LlmResponse, String> {
    // This is a stub for the actual LLM call.
    // In the future, we will make HTTP requests to an LLM provider (OpenAI, Ollama, etc.)

    let explanation = format!(
        "Analysis for position: {}\nEngine evaluation: {}\nRecommended line: {}\n\n(Stub) This move controls the center and develops a piece. The engine prefers it because it prepares for castling and puts pressure on the opponent's position.",
        request.fen, request.evaluation, request.principal_variation
    );

    Ok(LlmResponse { explanation })
}
