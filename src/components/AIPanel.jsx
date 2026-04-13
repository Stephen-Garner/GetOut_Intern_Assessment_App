import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, Plus, X, Send, Sparkles, Paperclip, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import useClaudeAvailability from '../hooks/useClaudeAvailability.js';
import AIPanelTab from './AIPanelTab.jsx';

async function buildFrontendContext() {
  const wsId = useAppStore.getState().activeWorkspaceId;
  if (!wsId) return {};

  try {
    const [summary, segments] = await Promise.all([
      fetch(`/api/data/summary?workspace=${wsId}`).then((response) => response.json()),
      fetch(`/api/data/segments?workspace=${wsId}`).then((response) => response.json()),
    ]);

    const workspace = useAppStore.getState().workspaces.find((item) => item.id === wsId);

    return {
      workspaceName: workspace?.name || 'Unknown',
      summary,
      segments,
      activePage: useAppStore.getState().activePageId,
    };
  } catch {
    return {};
  }
}

function formatBytes(size) {
  if (!size) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getFileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified || 0}`;
}

function createAttachmentRecord(file) {
  const isImage = file.type.startsWith('image/');
  return {
    clientId: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dedupeKey: getFileKey(file),
    file,
    preview: isImage ? URL.createObjectURL(file) : null,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    isImage,
  };
}

function formatMessageForTranscript(text, attachments) {
  const summary = attachments.length === 1
    ? `Attached 1 file: ${attachments[0].name}`
    : `Attached ${attachments.length} files: ${attachments.map((file) => file.name).join(', ')}`;

  if (text) {
    return `${text}\n\n[${summary}]`;
  }

  return `[${summary}]`;
}

function cleanupAttachmentPreviews(files) {
  files.forEach((file) => {
    if (file.preview) URL.revokeObjectURL(file.preview);
  });
}

export default function AIPanel() {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [panelWidth, setPanelWidth] = useState(380);
  const [dragOver, setDragOver] = useState(false);
  const [sendError, setSendError] = useState('');
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const isResizing = useRef(false);
  const dragCounterRef = useRef(0);
  const attachedFilesRef = useRef([]);

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
  } = useAppStore();

  useClaudeAvailability();

  const activeTab = chatTabs.find((tab) => tab.id === activeChatTabId);
  const isAnyStreaming = activeTab?.messages.some((m) => m.status === 'streaming') ?? false;

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/chat/debug');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setTestResult({
          ok: false,
          hint: 'Server returned unexpected response. Restart the server (npm run dev) to pick up recent changes.',
        });
        return;
      }
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, hint: `Could not reach server: ${err.message}` });
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    attachedFilesRef.current = attachedFiles;
  }, [attachedFiles]);

  useEffect(() => () => {
    cleanupAttachmentPreviews(attachedFilesRef.current);
  }, []);

  const stageFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setSendError('');
    setAttachedFiles((prev) => {
      const existingKeys = new Set(prev.map((file) => file.dedupeKey));
      const next = [...prev];

      for (const file of files) {
        const dedupeKey = getFileKey(file);
        if (existingKeys.has(dedupeKey)) continue;

        next.push(createAttachmentRecord(file));
        existingKeys.add(dedupeKey);
      }

      return next;
    });
  }, []);

  const removeAttachment = useCallback((clientId) => {
    setAttachedFiles((prev) => {
      const match = prev.find((file) => file.clientId === clientId);
      if (match?.preview) cleanupAttachmentPreviews([match]);
      return prev.filter((file) => file.clientId !== clientId);
    });
  }, []);

  const uploadAttachments = useCallback(async (files) => {
    if (files.length === 0) return [];

    const formData = new FormData();
    files.forEach(({ file }) => {
      formData.append('files', file);
    });

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Attachment upload failed');
    }

    const result = await response.json();
    const uploadedFiles = Array.isArray(result.files) ? result.files : [];

    return uploadedFiles.map((uploadedFile, index) => ({
      filename: uploadedFile.filename,
      originalName: files[index]?.name || uploadedFile.filename,
      mimeType: files[index]?.type || 'application/octet-stream',
      size: files[index]?.size ?? uploadedFile.size,
      path: uploadedFile.path,
    }));
  }, []);

  async function handleSend(text) {
    const nextText = typeof text === 'string' ? text.trim() : input.trim();
    if (!nextText && attachedFiles.length === 0) return;
    if (!activeChatTabId) return;

    setSendError('');

    const transcriptMessage = attachedFiles.length > 0
      ? formatMessageForTranscript(nextText, attachedFiles)
      : nextText;

    sendMessage(activeChatTabId, transcriptMessage || nextText);
    setInput('');

    const filesToSend = attachedFiles;
    setAttachedFiles([]);

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
    }

    const context = await buildFrontendContext();
    const tab = useAppStore.getState().chatTabs.find((item) => item.id === activeChatTabId);
    const history = (tab?.messages || []).slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const messageId = addAssistantMessage(activeChatTabId);

    try {
      const attachments = await uploadAttachments(filesToSend);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: nextText || 'Please review the attached files and respond based on them.',
          conversationHistory: history,
          context,
          attachments,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!response.ok || !reader) {
        throw new Error('Chat request failed');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) appendToMessage(activeChatTabId, messageId, data.text);
            if (data.error) {
              appendToMessage(activeChatTabId, messageId, `\n\nError: ${data.error}`);
              finalizeMessage(activeChatTabId, messageId, 'error');
              return;
            }
            if (data.done) {
              finalizeMessage(activeChatTabId, messageId, 'complete');
              return;
            }
          } catch {
            // Skip malformed stream chunks.
          }
        }
      }

      finalizeMessage(activeChatTabId, messageId, 'complete');
      cleanupAttachmentPreviews(filesToSend);
    } catch (error) {
      appendToMessage(activeChatTabId, messageId, `Error: ${error.message}`);
      finalizeMessage(activeChatTabId, messageId, 'error');
      setSendError(error.message);
      setAttachedFiles((prev) => {
        const existingKeys = new Set(prev.map((file) => file.dedupeKey));
        const next = [...prev];

        filesToSend.forEach((file) => {
          if (existingKeys.has(file.dedupeKey)) return;
          next.push(file);
        });

        return next;
      });
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  const handleMouseDown = useCallback((event) => {
    event.preventDefault();
    isResizing.current = true;
    const startX = event.clientX;
    const startWidth = panelWidth;

    function onMouseMove(moveEvent) {
      if (!isResizing.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 320), 800);
      setPanelWidth(newWidth);
    }

    function onMouseUp() {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  function handleFileInputChange(event) {
    stageFiles(event.target.files);
    event.target.value = '';
  }

  function handleInputChange(event) {
    setInput(event.target.value);
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  }

  function handleDragEnter(event) {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragCounterRef.current += 1;
    setDragOver(true);
  }

  function handleDragOver(event) {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }

  function handleDragLeave(event) {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);

    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
  }

  function handleDrop(event) {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    stageFiles(event.dataTransfer.files);
  }

  const canSend = input.trim().length > 0 || attachedFiles.length > 0;

  return (
    <div
      className={`shrink-0 h-full flex flex-col bg-surface-secondary border-l border-border-primary transition-[width] duration-300 ease-in-out ${
        aiPanelOpen ? '' : 'w-0 overflow-hidden border-l-0'
      }`}
      style={aiPanelOpen ? { width: panelWidth } : undefined}
    >
      <div className="flex-1 flex min-h-0">
        <div
          onMouseDown={handleMouseDown}
          className="w-[4px] shrink-0 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors"
        />

        <div
          className={`relative flex-1 flex flex-col min-w-0 overflow-hidden ${dragOver ? 'bg-accent/5' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-content-primary shrink-0">AI Assistant</span>
              {claudeAvailable && (
                <button
                  onClick={handleTestConnection}
                  disabled={testing || isAnyStreaming}
                  title="Test Claude connection"
                  className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors disabled:cursor-default ${
                    isAnyStreaming
                      ? 'bg-accent/10 text-accent'
                      : testResult
                        ? testResult.ok
                          ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                          : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                  }`}
                >
                  {testing ? (
                    <Loader2 size={8} className="animate-spin" />
                  ) : isAnyStreaming ? (
                    <span className="w-1 h-1 rounded-full bg-accent animate-bounce" />
                  ) : testResult ? (
                    testResult.ok
                      ? <CheckCircle2 size={8} />
                      : <AlertCircle size={8} />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                  )}
                  {isAnyStreaming ? 'Thinking' : testing ? 'Testing' : testResult ? (testResult.ok ? 'Working' : 'Issue') : 'Connected'}
                </button>
              )}
              {testResult && !testResult.ok && (
                <span className="text-[10px] text-red-400 truncate" title={testResult.hint}>
                  {testResult.hint}
                </span>
              )}
            </div>
            <button
              onClick={toggleAIPanel}
              className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors shrink-0"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-stretch border-b border-border-subtle">
            <div className="flex items-center flex-1 min-w-0 overflow-x-auto">
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
                      onClick={(event) => {
                        event.stopPropagation();
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
              className="shrink-0 flex items-center justify-center px-3 border-l border-border-subtle text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors"
              title="New chat"
            >
              <Plus size={14} />
            </button>
          </div>

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

          {dragOver && claudeAvailable && (
            <div className="pointer-events-none absolute inset-x-4 top-[88px] bottom-[92px] rounded-xl border-2 border-dashed border-accent bg-accent/10 flex items-center justify-center">
              <div className="text-center px-6">
                <Paperclip size={22} className="mx-auto mb-2 text-accent" />
                <p className="text-sm font-medium text-content-primary">Drop files to attach</p>
                <p className="text-xs text-content-muted mt-1">Images and general files are supported</p>
              </div>
            </div>
          )}

          {claudeAvailable && (
            <div className="p-3 border-t border-border-subtle bg-surface-secondary">
              {attachedFiles.length > 0 && (
                <div className="flex gap-2 mb-2.5 flex-wrap">
                  {attachedFiles.map((file) => (
                    <div key={file.clientId} className="relative group">
                      {file.isImage ? (
                        <img src={file.preview} alt="" className="w-14 h-14 rounded-md object-cover border border-border-subtle" />
                      ) : (
                        <div className="w-[148px] h-14 rounded-md border border-border-subtle bg-surface-tertiary px-2.5 py-2 flex items-center gap-2">
                          <div className="w-9 h-9 rounded-md bg-surface-secondary border border-border-subtle flex items-center justify-center shrink-0">
                            <FileText size={15} className="text-content-muted" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-content-primary truncate">{file.name}</p>
                            <p className="text-[10px] text-content-muted truncate">{formatBytes(file.size)}</p>
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => removeAttachment(file.clientId)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove attachment"
                      >
                        <X size={8} className="text-content-muted" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {sendError && (
                <p className="mb-2 text-xs text-red-400">{sendError}</p>
              )}

              <div className="flex items-end gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 self-end p-2 rounded-md text-content-muted hover:text-content-secondary hover:bg-surface-tertiary transition-colors"
                  title="Attach files"
                >
                  <Paperclip size={17} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <div className="flex-1 flex items-end gap-1.5 bg-surface-tertiary rounded-lg px-3 py-1">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your data..."
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-muted resize-none outline-none py-1"
                    style={{ lineHeight: '20px', minHeight: '20px', maxHeight: '150px' }}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!canSend}
                    className="shrink-0 p-1.5 rounded-md text-accent hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Send message"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
