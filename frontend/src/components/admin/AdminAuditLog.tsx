import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import type { AdminSecurityEvent } from '@/types';
import { listAuditEvents, type AuditFilters } from '@/services/api';
import { Badge, Button, Select, SkeletonList } from '@/components/ui';
import { AdminTable, EmptyState, ErrorState, Pager, errorMessage, formatDateTime } from './shared';

const PAGE = 50;

// Event names are dotted; the prefix is the category.
const CATEGORIES = [
  { value: '', label: 'All events' },
  { value: 'auth.', label: 'Sign-in & account' },
  { value: 'session.', label: 'Sessions' },
  { value: 'authz.', label: 'Access denied' },
  { value: 'admin.', label: 'Admin actions' },
  { value: 'upload.', label: 'Uploads' },
  { value: 'billing.', label: 'Billing' },
  { value: 'consent.', label: 'Consent' },
];

const OUTCOME_TONE = { success: 'green', failure: 'amber', denied: 'red' } as const;

const DetailChips = ({ details }: { details: Record<string, unknown> | null }) => {
  if (!details) return <span className="text-ink-subtle">—</span>;
  const entries = Object.entries(details).filter(([key]) => key !== 'user_agent');
  if (entries.length === 0) return <span className="text-ink-subtle">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span key={key} className="rounded-lg bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink-secondary">
          {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
        </span>
      ))}
    </div>
  );
};

const AdminAuditLog = () => {
  const [filters, setFilters] = useState<AuditFilters>({ skip: 0, limit: PAGE });
  const [page, setPage] = useState<{ items: AdminSecurityEvent[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listAuditEvents(filters)
      .then(setPage)
      .catch((err) => setError(errorMessage(err, 'Could not load the audit log.')));
  }, [filters]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          aria-label="Category"
          value={filters.event ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, event: e.target.value || undefined, skip: 0 }))}
          className="sm:!w-56"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Outcome"
          value={filters.outcome ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, outcome: (e.target.value || undefined) as AuditFilters['outcome'], skip: 0 }))}
          className="sm:!w-44"
        >
          <option value="">Any outcome</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="denied">Denied</option>
        </Select>
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={load} className="sm:ml-auto">
          Refresh
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !page ? (
        <SkeletonList rows={8} />
      ) : page.items.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-8 w-8" />} title="No events">
          Events are recorded from now on; older activity only exists in the server logs.
        </EmptyState>
      ) : (
        <>
          <AdminTable head={['Time', 'Event', 'Outcome', 'Account', 'IP', 'Details']} minWidth={960}>
            {page.items.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">{formatDateTime(e.created_at)}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink">{e.event}</td>
                <td className="px-4 py-3">
                  <Badge tone={OUTCOME_TONE[e.outcome as keyof typeof OUTCOME_TONE] ?? 'gray'}>{e.outcome}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{e.email ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-secondary">{e.ip ?? '—'}</td>
                <td className="px-4 py-3">
                  <DetailChips details={e.details} />
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pager skip={filters.skip ?? 0} limit={PAGE} total={page.total} onChange={(skip) => setFilters((prev) => ({ ...prev, skip }))} />
        </>
      )}
    </div>
  );
};

export default AdminAuditLog;
