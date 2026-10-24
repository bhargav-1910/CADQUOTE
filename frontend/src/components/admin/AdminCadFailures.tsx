import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react';
import type { AdminCadFailure } from '@/types';
import { listCadFailures, retryCadFile } from '@/services/api';
import { useToast } from '@/components/Toast';
import { Button, SkeletonList } from '@/components/ui';
import { AdminTable, EmptyState, ErrorState, Pager, errorMessage, formatDateTime } from './shared';

const PAGE = 25;

const formatSize = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const AdminCadFailures = () => {
  const toast = useToast();
  const [skip, setSkip] = useState(0);
  const [page, setPage] = useState<{ items: AdminCadFailure[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setError(null);
    listCadFailures(skip, PAGE)
      .then(setPage)
      .catch((err) => setError(errorMessage(err, 'Could not load failed files.')));
  }, [skip]);

  useEffect(load, [load]);

  const retry = async (file: AdminCadFailure) => {
    setRetrying((prev) => new Set(prev).add(file.id));
    try {
      await retryCadFile(file.id);
      toast({ message: `Re-analysing ${file.original_filename}…` });
      // Analysis runs in the background; refresh once it has had time to finish.
      window.setTimeout(load, 4000);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not queue the retry.') });
    } finally {
      window.setTimeout(() => setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      }), 4000);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Uploads whose geometry analysis failed. Retrying re-runs the analysis on the stored file at no cost to the user.
        </p>
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={load}>
          Refresh
        </Button>
      </div>

      {!page ? (
        <SkeletonList rows={4} />
      ) : page.items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-8 w-8 text-emerald-500" />} title="No failed files">
          Every uploaded CAD file has been analysed.
        </EmptyState>
      ) : (
        <>
          <AdminTable head={['File', 'Owner', 'Uploaded', 'Error', '']} minWidth={760}>
            {page.items.map((file) => (
              <tr key={file.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{file.original_filename}</p>
                  <p className="text-xs uppercase text-ink-muted">
                    {file.file_format} · {formatSize(file.file_size)}
                  </p>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{file.user_email}</td>
                <td className="px-4 py-3 text-ink-secondary">{formatDateTime(file.created_at)}</td>
                <td className="px-4 py-3 text-ink-secondary">{file.processing_error || 'Unknown error'}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    loading={retrying.has(file.id)}
                    onClick={() => retry(file)}
                  >
                    Retry
                  </Button>
                </td>
              </tr>
            ))}
          </AdminTable>
          <Pager skip={skip} limit={PAGE} total={page.total} onChange={setSkip} />
        </>
      )}
    </div>
  );
};

export default AdminCadFailures;
