import { useRef, useEffect, useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

const SUGGESTIONS = [
  'Which market has the worst Ghost rate?',
  'Draft an activation email for Ghost members',
  'Why might Groupon members churn more?',
  'Build a chart comparing channels by health score',
  'What should we focus on this quarter?',
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors"
      title="Copy code"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function renderMarkdown(text) {
  if (!text) return null;

  // Split on code blocks first
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code-block', lang: match[1], content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts.map((part, i) => {
    if (part.type === 'code-block') {
      return (
        <div key={i} className="relative my-2">
          <CopyButton text={part.content} />
          <pre className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono overflow-x-auto text-content-primary">
            <code>{part.content}</code>
          </pre>
        </div>
      );
    }

    // Process inline markdown for text parts
    return <span key={i}>{renderInlineMarkdown(part.content)}</span>;
  });
}

function renderInlineMarkdown(text) {
  const lines = text.split('\n');
  const result = [];
  let listBuffer = [];
  let listType = null; // 'bullet' or 'numbered'

  function flushList() {
    if (listBuffer.length === 0) return;
    if (listType === 'bullet') {
      result.push(
        <ul key={`list-${result.length}`} className="list-disc list-inside my-1 space-y-0.5">
          {listBuffer.map((item, j) => (
            <li key={j}>{formatInline(item)}</li>
          ))}
        </ul>
      );
    } else {
      result.push(
        <ol key={`list-${result.length}`} className="list-decimal list-inside my-1 space-y-0.5">
          {listBuffer.map((item, j) => (
            <li key={j}>{formatInline(item)}</li>
          ))}
        </ol>
      );
    }
    listBuffer = [];
    listType = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^[\-\*]\s+(.*)/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);

    if (bulletMatch) {
      if (listType && listType !== 'bullet') flushList();
      listType = 'bullet';
      listBuffer.push(bulletMatch[1]);
    } else if (numberedMatch) {
      if (listType && listType !== 'numbered') flushList();
      listType = 'numbered';
      listBuffer.push(numberedMatch[1]);
    } else {
      flushList();
      if (line.trim() === '') {
        result.push(<br key={`br-${i}`} />);
      } else {
        result.push(
          <span key={`line-${i}`}>
            {formatInline(line)}
            {i < lines.length - 1 ? '\n' : ''}
          </span>
        );
      }
    }
  }
  flushList();

  return result;
}

function formatInline(text) {
  // Process bold and inline code
  const parts = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIdx = 0;
  let m;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(text.slice(lastIdx, m.index));
    }
    if (m[2]) {
      // Bold
      parts.push(<strong key={m.index} className="font-semibold">{m[2]}</strong>);
    } else if (m[3]) {
      // Inline code
      parts.push(
        <code key={m.index} className="bg-surface-tertiary px-1 py-0.5 rounded text-xs font-mono">
          {m[3]}
        </code>
      );
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length > 0 ? parts : text;
}

export default function AIPanelTab({ tab, onSendMessage }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tab.messages.length, tab.messages[tab.messages.length - 1]?.content]);

  if (tab.messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-sm text-content-muted mb-3">Start a conversation</p>
          <p className="text-xs text-content-muted/60 mb-4">
            Ask questions about your data or request custom widgets
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onSendMessage(suggestion)}
                className="px-3 py-1.5 text-xs rounded-full border border-border-subtle hover:bg-surface-tertiary cursor-pointer text-content-secondary transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {tab.messages.map((msg, i) => {
        const isUser = msg.role === 'user';
        const isError = msg.status === 'error';
        const isStreaming = msg.status === 'streaming';

        return (
          <div key={msg.id || i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                isUser
                  ? 'bg-accent text-white rounded-br-md'
                  : isError
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 rounded-bl-md'
                  : 'bg-surface-tertiary text-content-primary rounded-bl-md'
              }`}
            >
              {isUser ? msg.content : (
              isStreaming && !msg.content ? (
                <div className="flex items-center gap-1.5 py-1">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-content-muted ml-1">Thinking...</span>
                </div>
              ) : (
                <>
                  {renderMarkdown(msg.content)}
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-4 bg-accent animate-pulse ml-0.5 align-middle" />
                  )}
                </>
              )
            )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
