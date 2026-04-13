export function normalizeClaudeAvailability(result) {
  if (typeof result === 'boolean') return result;
  return Boolean(result?.available);
}

function startCase(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferVisualizationTitle(code) {
  const namedFunctionMatch = code.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
  if (namedFunctionMatch?.[1]) {
    return startCase(namedFunctionMatch[1]);
  }

  const constMatch = code.match(/const\s+([A-Za-z0-9_]+)\s*=/);
  if (constMatch?.[1]) {
    return startCase(constMatch[1]);
  }

  return 'Playground Visualization';
}

export function extractVisualizationArtifact(text) {
  if (!text) return null;

  const match = text.match(/```jsx\s*([\s\S]*?)```/i);
  if (!match?.[1]) return null;

  const code = match[1].trim();
  if (!code.includes('export default')) return null;

  return {
    title: inferVisualizationTitle(code),
    code,
    savedWidgetId: null,
  };
}

export function formatAttachmentSuffix(attachments) {
  if (!attachments?.length) return '';
  return `\n\n[Attached: ${attachments.map((file) => file.name).join(', ')}]`;
}
