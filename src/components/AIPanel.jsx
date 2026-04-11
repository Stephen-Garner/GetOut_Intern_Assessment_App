import { useState } from 'react';
import { ChevronRight, Plus, X, Send } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import AIPanelTab from './AIPanelTab.jsx';

export default function AIPanel() {
  const [input, setInput] = useState('');
  const {
    aiPanelOpen,
    toggleAIPanel,
    chatTabs,
    activeChatTabId,
    addChatTab,
    setActiveChatTab,
    closeChatTab,
    sendMessage,
  } = useAppStore();

  const activeTab = chatTabs.find((t) => t.id === activeChatTabId);

  function handleSend() {
    const text = input.trim();
    if (!text || !activeChatTabId) return;
    sendMessage(activeChatTabId, text);
    setInput('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className={`panel-transition shrink-0 h-full flex flex-col bg-surface-secondary border-l border-border-primary ${
        aiPanelOpen ? 'w-[380px]' : 'w-0 overflow-hidden border-l-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-sm font-semibold text-content-primary">AI Assistant</span>
        <button
          onClick={toggleAIPanel}
          className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center border-b border-border-subtle overflow-x-auto">
        <div className="flex items-center flex-1 min-w-0">
          {chatTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveChatTab(tab.id)}
              className={`group flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab.id === activeChatTabId
                  ? 'border-accent text-accent'
                  : 'border-transparent text-content-muted hover:text-content-secondary'
              }`}
            >
              <span className="truncate max-w-[100px]">{tab.label}</span>
              {chatTabs.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeChatTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-tertiary transition-opacity"
                >
                  <X size={10} />
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={addChatTab}
          className="shrink-0 p-2 text-content-muted hover:text-content-primary transition-colors"
          title="New chat"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Chat Area */}
      {activeTab && <AIPanelTab tab={activeTab} />}

      {/* Input */}
      <div className="p-3 border-t border-border-subtle">
        <div className="flex items-end gap-2 bg-surface-tertiary rounded-lg px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your data..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-muted resize-none outline-none max-h-24"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="shrink-0 p-1.5 rounded-md text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
