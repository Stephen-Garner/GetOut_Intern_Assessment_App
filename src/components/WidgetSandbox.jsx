import { useState, useEffect, useMemo } from 'react';
import * as React from 'react';
import * as Recharts from 'recharts';
import * as LucideReact from 'lucide-react';
import { AlertTriangle, Code, RotateCcw } from 'lucide-react';

// Error boundary class component
class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle size={24} className="text-[var(--danger)] mb-2" />
          <p className="text-sm text-[var(--danger)]">Widget crashed</p>
          <p className="text-xs text-content-muted mt-1 max-w-xs">{this.state.error?.message}</p>
          {this.props.onRetry && (
            <button onClick={this.props.onRetry} className="mt-3 text-xs text-accent hover:underline">
              Ask AI to fix
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WidgetSandbox({ code, title, onRetry }) {
  const [Component, setComponent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!code) return;

    async function loadComponent() {
      try {
        // Dynamic import of sucrase for JSX transformation
        const { transform } = await import('sucrase');

        // Transform JSX to JS
        const transformed = transform(code, {
          transforms: ['jsx', 'imports'],
          production: true,
        }).code;

        // Create a module-like environment
        const moduleObj = { exports: {} };

        // Build the function with all available dependencies
        const fn = new Function(
          'module', 'exports', 'require',
          'React', 'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef',
          'Recharts', 'LucideReact',
          transformed
        );

        // Mock require for common imports
        const mockRequire = (name) => {
          if (name === 'react') return React;
          if (name === 'recharts') return Recharts;
          if (name === 'lucide-react') return LucideReact;
          return {};
        };

        fn(
          moduleObj, moduleObj.exports, mockRequire,
          React, React.useState, React.useEffect, React.useMemo, React.useCallback, React.useRef,
          Recharts, LucideReact
        );

        const comp = moduleObj.exports.default || moduleObj.exports;
        if (typeof comp === 'function') {
          setComponent(() => comp);
          setError(null);
        } else {
          setError('Widget did not export a valid React component');
          setComponent(null);
        }
      } catch (e) {
        setError(e.message);
        setComponent(null);
      }
    }

    loadComponent();
  }, [code]);

  if (error) {
    return (
      <div className="bg-surface-secondary border border-border-subtle rounded-lg p-5">
        {title && <h3 className="text-sm font-semibold text-content-primary mb-3">{title}</h3>}
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlertTriangle size={24} className="text-[var(--danger)] mb-2" />
          <p className="text-sm text-[var(--danger)] mb-1">Widget failed to render</p>
          <pre className="text-xs text-content-muted mt-2 max-w-md overflow-x-auto bg-surface-tertiary p-2 rounded">{error}</pre>
          {onRetry && (
            <button onClick={onRetry} className="mt-3 flex items-center gap-1.5 text-xs text-accent hover:underline">
              <RotateCcw size={12} /> Ask AI to fix
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="bg-surface-secondary border border-border-subtle rounded-lg p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-surface-tertiary rounded w-1/3" />
          <div className="h-48 bg-surface-tertiary rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary border border-border-subtle rounded-lg overflow-visible">
      {title && (
        <div className="px-5 py-4 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
        </div>
      )}
      <div className="p-5">
        <WidgetErrorBoundary onRetry={onRetry}>
          <Component />
        </WidgetErrorBoundary>
      </div>
    </div>
  );
}
