import { AlertCircle, Inbox } from 'lucide-react';

export default function WidgetCard({ title, subtitle, children, loading, error, empty, emptyMessage, className = '' }) {
  return (
    <div className={`bg-surface-secondary border border-border-subtle rounded-lg ${className}`}>
      {(title || subtitle) && (
        <div className="px-5 py-4 border-b border-border-subtle">
          {title && <h3 className="text-sm font-semibold text-content-primary">{title}</h3>}
          {subtitle && <p className="text-xs text-content-muted mt-0.5">{subtitle}</p>}
        </div>
      )}

      <div className="p-5">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-surface-tertiary rounded w-3/4" />
            <div className="h-32 bg-surface-tertiary rounded" />
            <div className="h-4 bg-surface-tertiary rounded w-1/2" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle size={24} className="text-danger mb-2" />
            <p className="text-sm text-danger">{error}</p>
            <p className="text-xs text-content-muted mt-1">Try refreshing the page</p>
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Inbox size={24} className="text-content-muted mb-2" />
            <p className="text-sm text-content-muted">{emptyMessage || 'No data available'}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
