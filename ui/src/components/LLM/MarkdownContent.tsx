import ReactMarkdown from "react-markdown";

interface Props {
  content: string;
  className?: string;
  /** Show a streaming caret after the content. */
  showCursor?: boolean;
}

/**
 * Lightweight markdown renderer for coach / explanation text.
 * Keeps styling inside the chat bubble; no raw HTML passthrough.
 */
export function MarkdownContent({ content, className, showCursor = false }: Props) {
  return (
    <div className={className ? `md-content ${className}` : "md-content"}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {showCursor && <span className="explanation-cursor">▊</span>}
    </div>
  );
}
