import type { StructuredAnalysis } from "../../types/analysis";
import type { ConversationEntry, ExplanationLevel } from "../../types/llm";

export const COACH_SYSTEM_PROMPT = `You are an interactive chess coach working with a club-level player.

CRITICAL RULES:
- You may ONLY use the supplied structured analysis JSON and the live board fen.
- Do NOT invent moves, variations, or calculations beyond the supplied data.
- Use standard algebraic notation (SAN) when referring to moves that appear in the data.
- Match the requested explanation_level.
- Be conversational and encouraging, like a human coach.
- The conversation may span multiple moves in one game. Always coach the CURRENT fen
  (and its analysis). You may refer to earlier chat turns for continuity, but never
  assume the board still matches an older position.

WHEN "hidden" IS true (coaching mode):
- Do NOT reveal the best move, evaluation, full plan, or tactical solutions.
- Ask ONE focused Socratic question at a time.
- Guide the student toward the key ideas without spoiling them.
- You may gently hint using general themes (king safety, piece activity, pawn structure)
  if those themes appear in the analysis concepts — but never name the best move.
- If the student is stuck after several turns, give a slightly stronger hint still without spoiling.

WHEN "hidden" IS false OR type is "coach_reveal":
- Fully explain the position using the structured analysis.
- Cover best move, key concepts, tactics, and the plan timeline.
- Reference what the student said earlier when relevant.

Opening a new session (type "coach_question"):
- Greet briefly and ask what they would improve first, or a similar open question.
- Keep the first message short.`;

export const COACH_REVEAL_SYSTEM_ADDENDUM = `
The student has asked to reveal the answer. Provide a clear, complete explanation of the
position based solely on the structured analysis. Summarize the best move, why it works,
key tactics/concepts, and the plan.`;

function formatEval(analysis: StructuredAnalysis): string {
  const lines = analysis.engine_lines;
  if (lines.length === 0) return "";
  const top = lines[0];
  if (top.score.kind === "cp") {
    const v = top.score.value / 100;
    return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  }
  return `mate in ${top.score.value}`;
}

function analysisPayload(analysis: StructuredAnalysis) {
  const lines = analysis.engine_lines;
  const bestMove = lines.length > 0 ? (lines[0].pv[0] ?? "") : "";
  return {
    fen: analysis.fen,
    best_move: bestMove,
    evaluation: formatEval(analysis),
    concepts: {
      initiative: analysis.concepts.initiative,
      tempo_advantage: analysis.concepts.tempo_advantage,
      key_ideas: analysis.concepts.key_ideas,
      plan: {
        immediate: analysis.concepts.plan.immediate,
        three_move: analysis.concepts.plan.medium,
        long_term: analysis.concepts.plan.long_term,
      },
      strategic_summary: analysis.concepts.strategic_summary,
    },
    tactics: analysis.tactics.map((t) => ({
      motif: t.motif_type,
      target: t.target,
      description: t.description,
      severity: t.severity,
    })),
  };
}

export function buildCoachUserPrompt(params: {
  analysis: StructuredAnalysis | null;
  fen: string;
  explanationLevel: ExplanationLevel;
  entries: ConversationEntry[];
  revealed: boolean;
  userMessage?: string;
  isReveal?: boolean;
}): string {
  const { analysis, fen, explanationLevel, entries, revealed, userMessage, isReveal } =
    params;

  let type: string;
  if (isReveal || revealed) {
    type = "coach_reveal";
  } else if (entries.length === 0 && !userMessage) {
    type = "coach_question";
  } else {
    type = "coach_follow_up";
  }

  const history = entries.map((e) => ({
    role: e.role,
    content: e.content,
  }));

  const payload: Record<string, unknown> = {
    type,
    explanation_level: explanationLevel,
    hidden: !(isReveal || revealed),
    conversation_history: history,
    // Always send the live board FEN so multi-move sessions stay current.
    fen,
  };

  if (userMessage !== undefined) {
    payload.user_message = userMessage;
  }

  if (analysis) {
    payload.analysis = analysisPayload(analysis);
  } else {
    payload.analysis = null;
    payload.note =
      "Structured analysis unavailable; coach from board position only and say if evidence is insufficient.";
  }

  return JSON.stringify(payload);
}
