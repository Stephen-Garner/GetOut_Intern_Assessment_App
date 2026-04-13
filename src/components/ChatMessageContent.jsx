import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

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

function formatInline(text) {
  const parts = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }

    if (match[2]) {
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <code key={match.index} className="bg-surface-tertiary px-1 py-0.5 rounded text-xs font-mono">
          {match[3]}
        </code>
      );
    }

    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length > 0 ? parts : text;
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1;
}

function isTableSeparator(line) {
  return isTableRow(line) && /^\|[\s\-|:]+\|$/.test(line.trim());
}

function parseTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function renderInlineMarkdown(text) {
  const lines = text.split('\n');
  const result = [];
  let listBuffer = [];
  let listType = null;
  let tableBuffer = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    if (listType === 'bullet') {
      result.push(
        <ul key={`list-${result.length}`} className="list-disc list-inside my-1 space-y-0.5">
          {listBuffer.map((item, index) => (
            <li key={index}>{formatInline(item)}</li>
          ))}
        </ul>
      );
    } else {
      result.push(
        <ol key={`list-${result.length}`} className="list-decimal list-inside my-1 space-y-0.5">
          {listBuffer.map((item, index) => (
            <li key={index}>{formatInline(item)}</li>
          ))}
        </ol>
      );
    }
    listBuffer = [];
    listType = null;
  }

  function flushTable() {
    if (tableBuffer.length === 0) return;

    const sepIndex = tableBuffer.findIndex(isTableSeparator);
    const headerRows = sepIndex > 0 ? tableBuffer.slice(0, sepIndex) : [];
    const bodyRows = sepIndex >= 0 ? tableBuffer.slice(sepIndex + 1) : tableBuffer;

    result.push(
      <div key={`table-${result.length}`} className="my-2 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          {headerRows.length > 0 && (
            <thead>
              {headerRows.map((row, ri) => (
                <tr key={ri} className="border-b border-border-subtle">
                  {parseTableRow(row).map((cell, ci) => (
                    <th key={ci} className="px-3 py-1.5 text-left font-semibold text-content-primary bg-surface-tertiary">
                      {formatInline(cell)}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
          )}
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary'}>
                {parseTableRow(row).map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-content-secondary border-b border-border-subtle/50">
                    {formatInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    tableBuffer = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isTableRow(line)) {
      flushList();
      tableBuffer.push(line);
      continue;
    }

    flushTable();

    const bulletMatch = line.match(/^[*-]\s+(.*)/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);

    if (bulletMatch) {
      if (listType && listType !== 'bullet') flushList();
      listType = 'bullet';
      listBuffer.push(bulletMatch[1]);
      continue;
    }

    if (numberedMatch) {
      if (listType && listType !== 'numbered') flushList();
      listType = 'numbered';
      listBuffer.push(numberedMatch[1]);
      continue;
    }

    flushList();

    if (line.trim() === '') {
      result.push(<br key={`br-${index}`} />);
      continue;
    }

    result.push(
      <span key={`line-${index}`}>
        {formatInline(line)}
        {index < lines.length - 1 ? '\n' : ''}
      </span>
    );
  }

  flushList();
  flushTable();

  return result;
}

function renderMarkdown(text) {
  if (!text) return null;

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

  return parts.map((part, index) => {
    if (part.type === 'code-block') {
      return (
        <div key={index} className="relative my-2">
          <CopyButton text={part.content} />
          <pre className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono overflow-x-auto text-content-primary">
            <code>{part.content}</code>
          </pre>
        </div>
      );
    }

    return <span key={index}>{renderInlineMarkdown(part.content)}</span>;
  });
}

export default function ChatMessageContent({ text }) {
  return renderMarkdown(text);
}
