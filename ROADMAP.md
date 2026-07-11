# Hyper-Croissant Roadmap

Hyper-Croissant is a modern chess analysis application (similar to En Croissant) built with Tauri and React. Its unique value proposition is to help users intuitively understand the chess moves that top engines (like Stockfish) play by using Large Language Models (LLMs) to provide natural language explanations.

## The Vision
While traditional chess engines give numerical evaluations (e.g., +1.5 or Mate in 4) and principal variations (the optimal sequence of moves), these outputs can be opaque and difficult to understand for players, especially club players and beginners.

Hyper-Croissant aims to bridge this gap by passing the engine's evaluation and the current board state to an LLM, which will act as a personal chess coach, explaining *why* a move is good, what the underlying tactical motifs or strategic plans are, and why an intuitive human move might be a blunder.

## Next Steps Roadmap

### Phase 1: Foundation & LLM Scaffolding (Current)
- [ ] Define the project vision and roadmap (this document).
- [ ] Establish the LLM API architecture in the Tauri backend.
- [ ] Add basic Tauri commands for prompting an LLM with a FEN position and engine evaluation.

### Phase 2: Core LLM Integration
- [ ] Implement integration with popular LLM APIs (e.g., OpenAI, Anthropic, or local models via Ollama) in the Rust backend.
- [ ] Define prompts that effectively translate engine evaluations (Centipawns, Principal Variations) into understandable chess concepts.
- [ ] Enhance the React frontend (`ui/src/components/LLM/`) to display these natural language explanations alongside the engine lines.

### Phase 3: Interactive Explanations
- [ ] Allow users to ask follow-up questions about specific moves or variations ("Why is Ne4 a blunder here?").
- [ ] Provide comparison mode: Compare the engine's top choice with the user's intended move and explain the difference in evaluation.
- [ ] Integrate with the move list and PGN viewer so explanations can be generated for historical games.

### Phase 4: Polish & Advanced Features
- [ ] User settings for LLM provider, API keys, and explanation style (e.g., "Beginner", "Advanced", "Positional Focus").
- [ ] Caching of LLM responses for common positions to save API costs and improve speed.
- [ ] Support for local LLMs for fully offline analysis.
