import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, Plus, X, Send, Sparkles, Image as ImageIcon } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import AIPanelTab from './AIPanelTab.jsx';

async function buildFrontendContext() {
  const wsId = useAppStore.getState().activeWorkspaceId;
  if (!wsId) return {};
  try {
    const [summary, segments] = await Promise.all([
      fetch(`/api/data/summary?workspace=${wsId}`).then(r => r.json()),
      fetch(`/api/data/segments?workspace=${wsId}`).then(r => r.json()),
    ]);
    const ws = useAppStore.getState().workspaces.find(w => w.id === wsId);
    return {
      workspaceName: ws?.name || 'Unknown',
      summary,
      segments,
      activePage: useAppStore.getState().activePageId,
    };
  } catch {
    return {};
  }
}

export default function AIPanel() {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState([]);
  const imageInputRef = useRef(null);
  const {
    aiPanelOpen,
    toggleAIPanel,
    chatTabs,
    activeChatTabId,
    addChatTab,
    setActiveChatTab,
    closeChatTab,
    sendMessage,
    addAssistantMessage,
    appendToMessage,
    finalizeMessage,
    claudeAvailable,
    setClaudeAvailable,
  } = useAppStore();

  const activeTab = chatTabs.find((t) => t.id === activeChatTabId);

  useEffect(() => {
    if (window.beacon?.isElectron) {
      window.beacon.checkClaude()
        .then((available) => setClaudeAvailable(available))
        .catch(() => setClaudeAvailable(false));
    } else {
      fetch('/api/chat/status')
        .then(r => r.json())
        .then(d => setClaudeAvailable(d.available))
        .catch(() => setClaudeAvailable(false));
    }
  }, [setClaudeAvailable]);

  async function handleSend(text) {
    if (typeof text !== 'string') text = input.trim();
    else text = text.trim();
    if (!text || !activeChatTabId) return;

    const imageNames = attachedImages.map(img => img.name);
    const fullMessage = imageNames.length > 0 ? `${text}\n\n[Attached images: ${imageNames.join(', ')}]` : text;
    sendMessage(activeChatTabId, fullMessage);
    setInput('');
    setAttachedImages([]);

    const context = await buildFrontendContext();

    const tab = chatTabs.find(t => t.id === activeChatTabId);
    const history = (tab?.messages || []).slice(-10).map(m => ({ role: m.role, content: m.content }));

    const msgId = addAssistantMessage(activeChatTabId);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationHistory: history, context }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) appendToMessage(activeChatTabId, msgId, data.text);
            if (data.error) {
              appendToMessage(activeChatTabId, msgId, `\n\nError: ${data.error}`);
              finalizeMessage(activeChatTabId, msgId, 'error');
              return;
            }
            if (data.done) {
              finalizeMessage(activeChatTabId, msgId, 'complete');
              return;
            }
          } catch {
            // skip unparseable lines
          }
        }
      }

      finalizeMessage(activeChatTabId, msgId, 'complete');
    } catch (err) {
      appendToMessage(activeChatTabId, msgId, `Error: ${err.message}`);
      finalizeMessage(activeChatTabId, msgId, 'error');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const [panelWidth, setPanelWidth] = useState(380);
  const isDragging = useRef(false);
  const textareaRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    function onMouseMove(e) {
      if (!isDragging.current) return;
      const delta = startX - e.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 320), 800);
      setPanelWidth(newWidth);
    }

    function onMouseUp() {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  function handleImageAttach(e) {
    const files = Array.from(e.target.files || []);
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));
    setAttachedImages(prev => [...prev, ...newImages]);
    e.target.value = '';
  }

  // Auto-resize textarea
  function handleInputChange(e) {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }

  return (
    <div
      className={`shrink-0 h-full flex flex-col bg-surface-secondary border-l border-border-primary transition-[width] duration-300 ease-in-out ${
        aiPanelOpen ? '' : 'w-0 overflow-hidden border-l-0'
      }`}
      style={aiPanelOpen ? { width: panelWidth } : undefined}
    >
      {/* Resize handle */}
      <div className="flex-1 flex min-h-0">
      <div
        onMouseDown={handleMouseDown}
        className="w-[4px] shrink-0 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors"
      />

      {/* Panel content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

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
      {!claudeAvailable ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <Sparkles size={28} className="mx-auto mb-3 text-content-muted" />
            <p className="text-sm font-medium text-content-primary mb-1">
              AI features require Claude Code
            </p>
            <p className="text-xs text-content-muted leading-relaxed">
              Install Claude Code to ask questions about your data,
              generate custom widgets, and get intelligent insights.
            </p>
          </div>
        </div>
      ) : (
        activeTab && <AIPanelTab tab={activeTab} onSendMessage={handleSend} />
      )}

      {/* Input */}
      {claudeAvailable && (
        <div className="p-3 border-t border-border-subtle">
          {/* Attached images preview */}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {attachedImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.preview} alt="" className="w-16 h-16 rounded-md object-cover border border-border-subtle" />
                  <button
                    onClick={() => setAttachedImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={8} className="text-content-muted" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5 bg-surface-tertiary rounded-lg px-3 py-1.5">
            <button
              onClick={() => imageInputRef.current?.click()}
              className="shrink-0 p-1.5 rounded-md text-content-muted hover:text-content-secondary transition-colors"
              title="Attach image"
            >
              <ImageIcon size={16} />
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageAttach}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your data..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-muted resize-none outline-none py-1.5"
              style={{ lineHeight: '20px', minHeight: '20px', maxHeight: '150px' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() && attachedImages.length === 0}
              className="shrink-0 p-1.5 rounded-md text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      </div>{/* end panel content */}
      </div>{/* end flex row */}
    </div>
  );
}
