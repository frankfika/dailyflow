/**
 * Reusable UI components for v2.
 */
import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  size = 'md',
  className = '',
  type = 'button',
  title,
  'data-testid': dataTestId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit';
  title?: string;
  'data-testid'?: string;
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-lg font-medium transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };
  const variants = {
    primary: 'bg-[var(--color-accent)] text-white hover:opacity-90',
    secondary: 'bg-black/5 dark:bg-white/10 text-[var(--color-text)] hover:bg-black/10 dark:hover:bg-white/15',
    danger: 'bg-red-500/10 text-red-600 hover:bg-red-500/20',
    ghost: 'text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/10',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={dataTestId}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) {
  const tones = {
    default: 'bg-black/5 dark:bg-white/10 text-[var(--color-text-muted)]',
    success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    danger: 'bg-red-500/10 text-red-600',
    info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-base font-semibold text-[var(--color-text)]">{title}</div>
      {body && <div className="max-w-md text-sm text-[var(--color-text-muted)]">{body}</div>}
      {action}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: { message: string; code?: string }; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm">
      <div className="font-medium text-red-600">{error.code ?? 'error'}</div>
      <div className="text-red-600/80">{error.message}</div>
      {onRetry && (
        <Button onClick={onRetry} variant="ghost" size="sm" className="mt-1">
          重试
        </Button>
      )}
    </div>
  );
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  }[size];
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${cls}`}
      aria-label="loading"
    />
  );
}

export function StateView({
  loading,
  error,
  empty,
  emptyTitle,
  emptyBody,
  onRetry,
  children,
}: {
  loading?: boolean;
  error?: { message: string; code?: string } | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-[var(--color-text-muted)]">
        <Spinner />
        加载中…
      </div>
    );
  }
  if (error) return <ErrorBanner error={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle ?? '没有内容'} body={emptyBody} />;
  return <>{children}</>;
}
