import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';

export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

export const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** Previous / next over an offset-paginated list. */
export const Pager = ({ skip, limit, total, onChange }: { skip: number; limit: number; total: number; onChange: (skip: number) => void }) => {
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-ink-muted">
      <span>
        {skip + 1}–{Math.min(skip + limit, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={skip === 0} onClick={() => onChange(Math.max(0, skip - limit))}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={skip + limit >= total} onClick={() => onChange(skip + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
};

export const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-8 text-center">
    <AlertCircle className="h-8 w-8 text-red-500" />
    <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
    <Button variant="secondary" size="sm" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

export const EmptyState = ({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-2xl border border-edge bg-surface p-10 text-center">
    <span className="text-ink-subtle">{icon}</span>
    <p className="font-semibold text-ink">{title}</p>
    {children && <p className="max-w-md text-sm text-ink-muted">{children}</p>}
  </div>
);

/** A column header; `className` carries responsive visibility (e.g. "hidden xl:table-cell"),
 *  which the matching <td>s must repeat. */
export type AdminColumn = string | { label: string; className: string };

/** Table chrome shared by the admin lists: card, horizontal scroll fallback, head row. */
export const AdminTable = ({ head, children, minWidth = 0 }: { head: AdminColumn[]; children: ReactNode; minWidth?: number }) => (
  <div className="overflow-x-auto rounded-2xl border border-edge bg-surface">
    <table className="w-full text-sm" style={{ minWidth }}>
      <thead className="border-b border-edge bg-surface-muted">
        <tr>
          {head.map((column, index) => {
            const { label, className = '' } = typeof column === 'string' ? { label: column } : column;
            return (
              <th
                key={label || index}
                scope="col"
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted ${index === head.length - 1 && !label ? 'text-right' : 'text-left'} ${className}`}
              >
                {label || (index === head.length - 1 ? <span className="sr-only">Actions</span> : null)}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-edge">{children}</tbody>
    </table>
  </div>
);
