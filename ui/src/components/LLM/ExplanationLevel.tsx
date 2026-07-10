import type { ExplanationLevel as ExplanationLevelType } from "../../types/llm";
import { EXPLANATION_LEVELS } from "../../types/llm";

interface Props {
  value: ExplanationLevelType;
  onChange: (level: ExplanationLevelType) => void;
}

export function ExplanationLevel({ value, onChange }: Props) {
  return (
    <div className="explanation-level">
      <span className="explanation-level-label">Level</span>
      <div className="explanation-level-options">
        {EXPLANATION_LEVELS.map((level) => (
          <button
            key={level.id}
            className={`explanation-level-btn${value === level.id ? " active" : ""}`}
            onClick={() => onChange(level.id)}
            title={`${level.label}: ${level.description}`}
            type="button"
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
