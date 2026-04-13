import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  FileText,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import useAppStore from '../stores/useAppStore.js';
import useClaudeAvailability from '../hooks/useClaudeAvailability.js';
import { api } from '../utils/api.js';
import {
  extractVisualizationArtifact,
  formatAttachmentSuffix,
} from '../utils/playground.js';
import ChatMessageContent from './ChatMessageContent.jsx';
import VisualizationArtifactCard from './VisualizationArtifactCard.jsx';

const STARTER_PROMPTS = [
  'What questions can we answer with this workspace?',
  'Where are the biggest activation risks across segments?',
  'What analysis should we run before building a visualization?',
];

function createPreviewFile(file) {
  const dedupeKey = `${file.name}:${file.size}:${file.lastModified || 0}`;
  return {
    file,
    id: `${dedupeKey}:${Date.now()}`,
    dedupeKey,
    name: file.name,
    size: file.size,
    isImage: file.type.startsWith('image/'),
    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
  };
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

function cleanupPreviewFiles(files) {
  files.forEach((file) => {
    if (file.preview) URL.revokeObjectURL(file.preview);
  });
}

function EmptyConversation({ onSendPrompt }) {
  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="max-w-2xl text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-accent/10 flex items-center justify-center">
          <Sparkles size={24} className="text-accent" />
        </div>
        <h2 className="text-xl font-semibold text-content-primary mb-2">Playground</h2>
        <p className="text-sm text-content-secondary leading-relaxed mb-6">
          Use Plan mode to discuss what insights you are looking for from the data and Build to create the visualization.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSendPrompt(prompt)}
              className="px-3 py-1.5 text-xs rounded-full border border-border-subtle hover:bg-surface-tertiary text-content-secondary transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PlaygroundPanel({ activeWorkspace, onGoToSettings }) {
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [sendError, setSendError] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const pendingFilesRef = useRef([]);
  const dragCounterRef = useRef(0);

  const {
    claudeAvailable,
    playgroundMode,
    setPlaygroundMode,
    playgroundThreads,
    activePlaygroundThreadId,
    ensurePlaygroundThread,
    addPlaygroundThread,
    setActivePlaygroundThread,
    closePlaygroundThread,
    sendPlaygroundMessage,
    addPlaygroundAssistantMessage,
    appendToPlaygroundMessage,
    finalizePlaygroundMessage,
    setPlaygroundThreadAttachments,
    attachArtifactToPlaygroundMessage,
    markPlaygroundArtifactSaved,
    showToast,
  } = useAppStore();

  useClaudeAvailability();

  const workspaceId = activeWorkspace?.id || null;

  const workspaceThreads = useMemo(
    () => playgroundThreads.filter((thread) => thread.workspaceId === workspaceId),
    [playgroundThreads, workspaceId]
  );

  const activeThread = useMemo(
    () => workspaceThreads.find((thread) => thread.id === activePlaygroundThreadId) || workspaceThreads[0] || null,
    [workspaceThreads, activePlaygroundThreadId]
  );

  useEffect(() => {
    if (workspaceId) {
      ensurePlaygroundThread(workspaceId);
    }
  }, [workspaceId, ensurePlaygroundThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages]);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => () => {
    cleanupPreviewFiles(pendingFilesRef.current);
  }, []);

  function resetComposer() {
    setInput('');
    setPendingFiles((current) => {
      cleanupPreviewFiles(current);
      return [];
    });
    setSendError('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleInputChange(event) {
    setInput(event.target.value);
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }

  function stageFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setSendError('');
    setPendingFiles((current) => {
      const existingKeys = new Set(current.map((file) => file.dedupeKey));
      const next = [...current];

      for (const file of files) {
        const previewFile = createPreviewFile(file);
        if (existingKeys.has(previewFile.dedupeKey)) {
          if (previewFile.preview) URL.revokeObjectURL(previewFile.preview);
          continue;
        }
        next.push(previewFile);
        existingKeys.add(previewFile.dedupeKey);
      }

      return next;
    });
  }

  function handleAttach(event) {
    stageFiles(event.target.files);
    event.target.value = '';
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  async function uploadFiles(threadId) {
    if (!workspaceId || !threadId || pendingFiles.length === 0) return [];

    const formData = new FormData();
    formData.append('workspaceId', workspaceId);
    formData.append('threadId', threadId);
    pendingFiles.forEach((file) => formData.append('files', file.file));

    const response = await fetch('/api/playground/attachments', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Attachment upload failed');
    }

    return payload.files || [];
  }

  function maybeAttachVisualizationArtifact(threadId, messageId, requestMode) {
    if (requestMode !== 'build') return;

    const thread = useAppStore.getState().playgroundThreads.find((item) => item.id === threadId);
    const message = thread?.messages.find((item) => item.id === messageId);
    const artifact = extractVisualizationArtifact(message?.content);

    if (artifact) {
      attachArtifactToPlaygroundMessage(threadId, messageId, artifact);
    }
  }

  async function handleSend(prefilledText) {
    if (!workspaceId) return;

    const threadId = activeThread?.id || ensurePlaygroundThread(workspaceId);
    if (!threadId) return;
    const requestMode = playgroundMode;

    const baseText = typeof prefilledText === 'string' ? prefilledText.trim() : input.trim();
    const fallbackText = requestMode === 'build'
      ? 'Use the attached files and active workspace to build a Beacon visualization.'
      : 'Review the attached files and help me understand what insights we can extract.';
    const messageText = baseText || (pendingFiles.length > 0 ? fallbackText : '');

    if (!messageText) return;

    setSendError('');

    const currentThread = useAppStore.getState().playgroundThreads.find((thread) => thread.id === threadId);
    const history = (currentThread?.messages || []).slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    try {
      const uploadedFiles = await uploadFiles(threadId);
      const allAttachments = [...(currentThread?.attachments || []), ...uploadedFiles];
      const visibleMessage = `${messageText}${formatAttachmentSuffix(uploadedFiles)}`;

      sendPlaygroundMessage(threadId, visibleMessage);
      setPlaygroundThreadAttachments(threadId, uploadedFiles);
      resetComposer();

      const assistantMessageId = addPlaygroundAssistantMessage(threadId);
      const response = await fetch('/api/playground/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          threadId,
          mode: requestMode,
          message: messageText,
          conversationHistory: history,
          attachments: allAttachments,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Playground request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream available');
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
            if (data.text) appendToPlaygroundMessage(threadId, assistantMessageId, data.text);
            if (data.error) {
              appendToPlaygroundMessage(threadId, assistantMessageId, `\n\nError: ${data.error}`);
              finalizePlaygroundMessage(threadId, assistantMessageId, 'error');
              return;
            }
            if (data.done) {
              finalizePlaygroundMessage(threadId, assistantMessageId, 'complete');
              maybeAttachVisualizationArtifact(threadId, assistantMessageId, requestMode);
              return;
            }
          } catch {
            // Skip malformed stream chunks.
          }
        }
      }

      finalizePlaygroundMessage(threadId, assistantMessageId, 'complete');
      maybeAttachVisualizationArtifact(threadId, assistantMessageId, requestMode);
    } catch (error) {
      setSendError(error.message);
      const assistantMessageId = addPlaygroundAssistantMessage(threadId);
      appendToPlaygroundMessage(threadId, assistantMessageId, `Error: ${error.message}`);
      finalizePlaygroundMessage(threadId, assistantMessageId, 'error');
    }
  }

  function removePendingFile(fileId) {
    setPendingFiles((current) => {
      const match = current.find((file) => file.id === fileId);
      if (match?.preview) cleanupPreviewFiles([match]);
      return current.filter((file) => file.id !== fileId);
    });
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

  async function handleCloseThread(threadId) {
    if (!workspaceId) return;

    try {
      await fetch(`/api/playground/thread/${threadId}?workspace=${workspaceId}`, { method: 'DELETE' });
    } catch {
      // Best effort cleanup only.
    }

    closePlaygroundThread(threadId);
  }

  async function handleAddArtifact(message) {
    if (!workspaceId || !message?.artifact || message.artifact.savedWidgetId) return;

    const savedWidget = await api.post(`/widgets?workspace=${workspaceId}`, {
      title: message.artifact.title,
      description: 'Generated from Playground',
      code: message.artifact.code,
    });

    markPlaygroundArtifactSaved(activeThread.id, message.id, savedWidget.id);
    window.dispatchEvent(new CustomEvent('beacon-dashboard-widget-added', { detail: savedWidget }));
    showToast(`Added "${savedWidget.title}" to the dashboard.`);
  }

  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Sparkles size={28} className="text-accent/60" />
          </div>
          <h2 className="text-lg font-semibold text-content-primary mb-2">Playground needs a workspace</h2>
          <p className="text-sm text-content-muted mb-6 leading-relaxed">
            Connect a data source first so Playground can reason about your files and create visualizations against the active workspace.
          </p>
          <button
            onClick={onGoToSettings}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to Settings
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  if (!claudeAvailable) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="text-center max-w-md">
          <Sparkles size={30} className="mx-auto mb-4 text-content-muted" />
          <h2 className="text-lg font-semibold text-content-primary mb-2">Claude Code is required</h2>
          <p className="text-sm text-content-muted leading-relaxed">
            Install Claude Code to plan against workspace data, analyze uploaded files, and generate Beacon-ready visualizations in Playground.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative h-full min-h-0 flex flex-col bg-surface-secondary border border-border-subtle border-b-0 rounded-t-2xl rounded-b-none overflow-hidden ${dragOver ? 'bg-accent/5' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-5 py-4 border-b border-border-subtle bg-gradient-to-r from-accent/8 via-accent/4 to-transparent">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-primary border border-border-subtle text-[11px] font-semibold uppercase tracking-[0.18em] text-content-secondary">
              <Wand2 size={12} className="text-accent" />
              Playground
            </div>
            <h2 className="text-lg font-semibold text-content-primary mt-3">Workspace: {activeWorkspace.name}</h2>
            <p className="text-sm text-content-secondary mt-1 max-w-3xl">
              Use Plan mode to discuss what insights you are looking for from the data and Build to create the visualization.
            </p>
          </div>

          <button
            onClick={() => addPlaygroundThread(workspaceId)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle text-sm text-content-secondary hover:text-content-primary hover:bg-surface-primary transition-colors"
          >
            <Plus size={14} />
            New Thread
          </button>
        </div>
      </div>

      <div className="flex items-center border-b border-border-subtle px-3 overflow-x-auto bg-surface-primary/70">
        {workspaceThreads.map((thread) => (
          <button
            key={thread.id}
            onClick={() => setActivePlaygroundThread(thread.id)}
            className={`group flex items-center gap-2 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              thread.id === activeThread?.id
                ? 'border-accent text-accent'
                : 'border-transparent text-content-muted hover:text-content-secondary'
            }`}
          >
            <span className="truncate max-w-[140px]">{thread.label}</span>
            {workspaceThreads.length > 1 && (
              <span
                onClick={(event) => {
                  event.stopPropagation();
                  handleCloseThread(thread.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-tertiary transition-opacity"
              >
                <X size={10} />
              </span>
            )}
          </button>
        ))}
      </div>

      {activeThread?.messages.length ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_38%)]">
          {activeThread.messages.map((message) => {
            const isUser = message.role === 'user';
            const isError = message.status === 'error';
            const isStreaming = message.status === 'streaming';

            return (
              <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`${isUser ? 'max-w-[76%]' : 'max-w-[88%]'} ${isUser ? '' : 'w-full'}`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                      isUser
                        ? 'bg-accent text-white rounded-br-md'
                        : isError
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20 rounded-bl-md'
                        : 'bg-surface-primary text-content-primary border border-border-subtle rounded-bl-md'
                    }`}
                  >
                    {isUser ? (
                      message.content
                    ) : isStreaming && !message.content.trim() ? (
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
                        <ChatMessageContent text={message.content} />
                        {isStreaming && (
                          <span className="inline-block w-1.5 h-4 bg-accent animate-pulse ml-0.5 align-middle" />
                        )}
                      </>
                    )}
                  </div>

                  {message.artifact && (
                    <VisualizationArtifactCard
                      artifact={message.artifact}
                      onAdd={() => handleAddArtifact(message)}
                    />
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      ) : (
        <EmptyConversation onSendPrompt={handleSend} />
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-x-5 top-[132px] bottom-[112px] rounded-2xl border-2 border-dashed border-accent bg-accent/10 flex items-center justify-center">
          <div className="text-center px-6">
            <Paperclip size={24} className="mx-auto mb-2 text-accent" />
            <p className="text-sm font-medium text-content-primary">Drop files to attach</p>
            <p className="text-xs text-content-muted mt-1">Images and general files are supported</p>
          </div>
        </div>
      )}

      <div className="border-t border-border-subtle bg-surface-primary px-5 py-4">
        {activeThread?.attachments?.length > 0 && (
          <div className="mb-3 flex items-center gap-2 text-xs text-content-muted">
            <FileText size={12} />
            <span>{activeThread.attachments.length} attachment{activeThread.attachments.length === 1 ? '' : 's'} available in this thread</span>
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {pendingFiles.map((file) => (
              <div key={file.id} className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-tertiary border border-border-subtle">
                {file.isImage ? (
                  <img src={file.preview} alt="" className="w-8 h-8 rounded-lg object-cover border border-border-subtle" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-surface-primary border border-border-subtle flex items-center justify-center">
                    <FileText size={14} className="text-content-muted" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-content-primary truncate max-w-[180px]">{file.name}</p>
                  <p className="text-[11px] text-content-muted">{formatBytes(file.size)}</p>
                </div>
                <button
                  onClick={() => removePendingFile(file.id)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-content-muted hover:text-content-primary hover:bg-surface-primary transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {sendError && (
          <p className="mb-3 text-xs text-red-400">{sendError}</p>
        )}

        <div className="flex items-end gap-3">
          <div className="shrink-0 p-1 rounded-xl bg-surface-tertiary border border-border-subtle flex">
            {['plan', 'build'].map((mode) => (
              <button
                key={mode}
                onClick={() => setPlaygroundMode(mode)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
                  playgroundMode === mode
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 self-end p-2 rounded-xl text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors"
            title="Attach files"
          >
            <Paperclip size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleAttach}
          />

          <div className="flex-1 rounded-2xl border border-border-subtle bg-surface-secondary shadow-sm">
            <div className="flex items-end gap-2 px-3 py-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={
                  playgroundMode === 'build'
                    ? 'Describe the visualization you want Beacon to build...'
                    : 'Describe the questions or insights you want to investigate...'
                }
                className="flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-muted resize-none outline-none py-1"
                style={{ lineHeight: '20px', minHeight: '22px', maxHeight: '180px' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() && pendingFiles.length === 0}
                className="shrink-0 p-2 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
