import { useRef, useEffect } from 'react';
import ChatMessageContent from './ChatMessageContent.jsx';

const SUGGESTIONS = [
  'Which market has the worst Ghost rate?',
  'Draft an activation email for Ghost members',
  'Why might Groupon members churn more?',
  'Build a chart comparing channels by health score',
  'What should we focus on this quarter?',
];

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
              ) : !msg.content && !isError ? (
                <span className="text-xs text-content-muted italic">
                  No response received. Try again or run{' '}
                  <code className="bg-surface-secondary px-1 rounded font-mono">claude login</code>{' '}
                  in a terminal if the issue persists.
                </span>
              ) : (
                <>
                  <ChatMessageContent text={msg.content} />
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
