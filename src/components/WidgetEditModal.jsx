// src/components/WidgetEditModal.jsx
import { useState } from 'react';
import { CheckCircle2, Send, X } from 'lucide-react';
import { api } from '../utils/api.js';
import { extractVisualizationArtifact } from '../utils/playground.js';

export default function WidgetEditModal({ widget, workspaceId, onSave, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [revisedCode, setRevisedCode] = useState(null);
  const [error, setError] = useState('');
  async function handleGenerate() {
    if (!prompt.trim() || streaming) return;

    if (!workspaceId) {
      setError('No active workspace. Please select a workspace before editing.');
      return;
    }

    setStreaming(true);
    setStreamedContent('');
    setRevisedCode(null);
    setError('');

    try {
      const response = await fetch(
        `/api/widgets/${widget.id}/ai-edit?workspace=${workspaceId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Edit request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (!reader) throw new Error('No response stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              fullContent += data.text;
              setStreamedContent(fullContent);
            }
            if (data.error) {
              setError(data.error);
              setStreaming(false);
              reader.cancel();
              return;
            }
            if (data.done) {
              const artifact = extractVisualizationArtifact(fullContent);
              if (artifact?.code) {
                setRevisedCode(artifact.code);
              } else {
                setError('Claude did not return valid JSX code. Try rephrasing your request.');
              }
              setStreaming(false);
              reader.cancel();
              return;
            }
          } catch { /* skip malformed */ }
        }
      }
      setStreaming(false);
    } catch (err) {
      setError(err.message);
      setStreaming(false);
    }
  }

  async function handleSave() {
    if (!revisedCode) return;
    try {
      await api.put(`/widgets/${widget.id}?workspace=${workspaceId}`, { code: revisedCode });
      onSave({ ...widget, code: revisedCode });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-surface-primary border border-border-subtle shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-base font-semibold text-content-primary">Edit with AI: {widget.title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Current code */}
        <div className="px-5 py-3 border-b border-border-subtle shrink-0">
          <p className="text-xs font-medium text-content-muted uppercase tracking-wide mb-2">Current Code</p>
          <pre className="text-xs text-content-secondary bg-surface-secondary rounded-lg p-3 overflow-x-auto max-h-36 overflow-y-auto">
            {widget.code}
          </pre>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Prompt input */}
          <div>
            <label className="block text-xs font-medium text-content-muted uppercase tracking-wide mb-2">
              Describe the change
            </label>
            <div className="flex gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                rows={2}
                placeholder="e.g. Change the bar chart to a line chart and add a 30-day moving average"
                className="flex-1 bg-surface-secondary border border-border-subtle rounded-xl px-3 py-2 text-sm text-content-primary placeholder:text-content-muted resize-none outline-none focus:border-accent/50 transition-colors"
                disabled={streaming}
              />
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || streaming}
                className="shrink-0 p-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
              >
                <Send size={15} />
              </button>
            </div>
          </div>

          {/* Streaming / thinking state */}
          {streaming && !streamedContent && (
            <div className="flex items-center gap-2 text-content-muted text-sm py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs">Thinking...</span>
            </div>
          )}

          {/* Revised code preview */}
          {(streamedContent || revisedCode) && (
            <div>
              <p className="text-xs font-medium text-content-muted uppercase tracking-wide mb-2">
                {revisedCode ? 'Revised Code' : 'Generating...'}
              </p>
              <pre className="text-xs text-content-secondary bg-surface-secondary rounded-lg p-3 overflow-x-auto max-h-56 overflow-y-auto">
                {revisedCode ?? streamedContent}
                {streaming && (
                  <span className="inline-block w-1.5 h-4 bg-accent animate-pulse ml-0.5 align-middle" />
                )}
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-subtle shrink-0 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!revisedCode}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle2 size={14} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
