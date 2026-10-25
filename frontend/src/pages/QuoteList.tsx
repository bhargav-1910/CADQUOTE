import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, Loader2, AlertCircle, CheckCircle, Search, Pencil, Eye, Download, Trash2 } from 'lucide-react';
import type { QuoteListItem } from '@/types';
import { listQuotes, downloadQuotePDF, deleteQuote } from '@/services/api';
import PartThumbnail from '@/components/PartThumbnail';
import Breadcrumbs from '@/components/Breadcrumbs';

import { Button, Input, SkeletonList, StatusPill, buttonClasses } from '@/components/ui';
import { useToast } from '@/components/Toast';
type StatusFilter = 'all' | 'generated' | 'sent' | 'accepted' | 'declined' | 'expired' | 'draft';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'generated', label: 'Generated' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
  { value: 'draft', label: 'Draft' },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

/** Validity cell: countdown chip when close to expiry, plain date otherwise. */
const ValidityCell = ({ validUntil, status }: { validUntil: string; status: string }) => {
  const expiry = new Date(validUntil).getTime();
  const daysLeft = Math.ceil((expiry - Date.now()) / 86400000);
  if (status === 'accepted' || status === 'declined') {
    return <span className="text-sm text-ink-secondary">{formatDate(validUntil)}</span>;
  }
  const expired = status === 'expired' || daysLeft <= 0;

  if (expired) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
        Expired {formatDate(validUntil)}
      </span>
    );
  }
  if (daysLeft <= 5) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
        {daysLeft} day{daysLeft === 1 ? '' : 's'} left
      </span>
    );
  }
  return <span className="text-sm text-ink-secondary">{formatDate(validUntil)}</span>;
};

/** View / edit / download / delete, shared by the card and table layouts. */
const QuoteRowActions = ({
  quote,
  downloading,
  onDownload,
  onDelete,
}: {
  quote: QuoteListItem;
  downloading: boolean;
  onDownload: (event: React.MouseEvent, quote: QuoteListItem) => void;
  onDelete: (event: React.MouseEvent, quote: QuoteListItem) => void;
}) => (
  <>
    <Link
      to={`/quotes/${quote.id}`}
      onClick={(event) => event.stopPropagation()}
      title="View"
      aria-label={`View ${quote.quote_number}`}
      className={buttonClasses('ghost', 'icon')}
    >
      <Eye className="w-4 h-4" />
    </Link>
    <Link
      to={`/quotes/${quote.id}/edit`}
      onClick={(event) => event.stopPropagation()}
      title="Edit in configure"
      aria-label={`Edit in configure ${quote.quote_number}`}
      className={buttonClasses('ghost', 'icon')}
    >
      <Pencil className="w-4 h-4" />
    </Link>
    <button
      type="button"
      onClick={(event) => onDownload(event, quote)}
      title="Download PDF"
      aria-label={`Download PDF ${quote.quote_number}`}
      className={buttonClasses('ghost', 'icon')}
    >
      {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
    </button>
    {quote.status !== 'accepted' && quote.status !== 'declined' && (
      <button
        type="button"
        onClick={(event) => onDelete(event, quote)}
        title="Delete quote"
        aria-label={`Delete quote ${quote.quote_number}`}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-secondary transition hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    )}
  </>
);

const QuoteList = () => {
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const batchResult = location.state as { batchIds?: string[]; batchTotal?: number } | null;

  const loadQuotes = () => {
    setLoading(true);
    setError(null);
    listQuotes(0, 200)
      .then(setQuotes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load quotes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQuotes();
  }, []);

  const filtersActive = search.trim() !== '' || statusFilter !== 'all';
  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (statusFilter !== 'all' && quote.status !== statusFilter) return false;
      if (!q) return true;
      return (
        quote.quote_number.toLowerCase().includes(q) ||
        (quote.title ?? '').toLowerCase().includes(q) ||
        (quote.customer_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [quotes, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: quotes.length };
    quotes.forEach((quote) => {
      counts[quote.status] = (counts[quote.status] ?? 0) + 1;
    });
    return counts;
  }, [quotes]);

  const totalFilteredValue = filtered.reduce((sum, quote) => sum + Number(quote.total_price || 0), 0);

  const handleDownload = async (event: React.MouseEvent, quote: QuoteListItem) => {
    event.stopPropagation();
    setDownloadingId(quote.id);
    try {
      await downloadQuotePDF(quote.id, quote.quote_number);
    } catch {
      // Non-fatal; row action only.
    } finally {
      setDownloadingId(null);
    }
  };

  // Put a removed quote back in its original (newest-first) position.
  const restoreQuote = (quote: QuoteListItem) =>
    setQuotes((prev) =>
      prev.some((q) => q.id === quote.id)
        ? prev
        : [...prev, quote].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    );

  // Undo instead of a confirm dialog: the row disappears at once and the
  // server delete only runs when the toast's undo window closes.
  const handleDelete = (event: React.MouseEvent, quote: QuoteListItem) => {
    event.stopPropagation();
    setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
    toast({
      message: `Deleted ${quote.quote_number}`,
      action: { label: 'Undo', onClick: () => restoreQuote(quote) },
      onExpire: () => {
        deleteQuote(quote.id).catch((err) => {
          restoreQuote(quote);
          toast({
            tone: 'error',
            message: `Couldn't delete ${quote.quote_number}: ${err instanceof Error ? err.message : 'try again'}`,
          });
        });
      },
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <Breadcrumbs items={[{ label: 'Quotes' }]} />

      {/* Batch success banner */}
      {batchResult?.batchIds && batchResult.batchIds.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
              {batchResult.batchIds.length} quotes created successfully!
            </p>
            {batchResult.batchTotal !== undefined && (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Combined total: {formatCurrency(Number(batchResult.batchTotal))}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Quotes</h1>
          <p className="text-ink-secondary text-sm">
            {quotes.length} total · {formatCurrency(totalFilteredValue)} in view
          </p>
        </div>
        <Link
          to="/quotes/new" className={buttonClasses('accent', 'md', 'w-fit')}
        >
          <Plus className="w-4 h-4" />
          New quote
        </Link>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col xl:flex-row gap-3 xl:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle" />
          <Input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, number or customer…" className="w-full pl-9 pr-3"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                statusFilter === value
                  ? 'bg-ink text-surface border-ink'
                  : 'bg-surface text-ink-secondary border-edge hover:border-edge-strong'
              }`}
            >
              {label}
              {statusCounts[value] !== undefined && (
                <span className={`ml-1.5 ${statusFilter === value ? 'text-ink-subtle' : 'text-ink-subtle'}`}>
                  {statusCounts[value] ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonList rows={6} />
      ) : error ? (
        // A load failure is not the same as "no quotes" — showing the empty
        // state here would look like the account's data disappeared.
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-12 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-300 mb-2">Couldn't load your quotes</h2>
          <p className="text-red-700 dark:text-red-300 mb-6">{error}</p>
          <Button variant="danger" size="lg"
            onClick={loadQuotes}
          >
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface rounded-xl border border-edge p-12 text-center">
          <FileText className="w-16 h-16 text-ink-subtle mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-ink mb-2">
            {quotes.length === 0 ? 'No quotes yet' : 'No quotes match your filters'}
          </h2>
          <p className="text-ink-secondary mb-6">
            {quotes.length === 0
              ? 'Create your first quote by uploading a CAD file'
              : 'Try a different search term or status filter'}
          </p>
          {quotes.length === 0 ? (
            <Link
              to="/quotes/new" className={buttonClasses('primary', 'lg')}
            >
              <Plus className="w-5 h-5" />
              Create Quote
            </Link>
          ) : filtersActive && (
            <Button variant="secondary" size="lg"
              onClick={resetFilters}
            >
              Reset filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Phones: one card per quote; the whole card opens the quote. */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((quote) => (
              <li key={quote.id} className="rounded-2xl border border-edge bg-surface">
                <Link to={`/quotes/${quote.id}`} className="flex items-start gap-3 p-4">
                  <PartThumbnail fileId={quote.cad_file_id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        {quote.title && <span className="block truncate text-sm font-semibold text-ink">{quote.title}</span>}
                        <span className="block truncate font-mono text-sm font-medium text-primary-700 dark:text-primary-300">{quote.quote_number}</span>
                      </span>
                      <span className="shrink-0 font-mono text-sm font-semibold text-ink">{formatCurrency(quote.total_price)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-ink-secondary">{quote.customer_name || 'No customer'}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusPill status={quote.status} />
                      <ValidityCell validUntil={quote.valid_until} status={quote.status} />
                    </span>
                  </span>
                </Link>
                <div className="flex items-center justify-between border-t border-edge px-2 py-1">
                  <span className="px-2 text-xs text-ink-muted">Created {formatDate(quote.created_at)}</span>
                  <span className="flex">
                    <QuoteRowActions quote={quote} downloading={downloadingId === quote.id} onDownload={handleDownload} onDelete={handleDelete} />
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet and up: a table whose secondary columns appear as width allows. */}
          <div className="hidden overflow-hidden rounded-2xl border border-edge bg-surface md:block">
            <table className="w-full">
              <thead className="bg-surface-muted border-b border-edge">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Quote</th>
                  <th className="hidden text-left xl:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Customer</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Status</th>
                  <th className="hidden text-left xl:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Validity</th>
                  <th className="hidden text-left 2xl:table-cell px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Created</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filtered.map((quote) => (
                  <tr
                    key={quote.id}
                    className="hover:bg-surface-muted cursor-pointer"
                    onClick={() => navigate(`/quotes/${quote.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <PartThumbnail fileId={quote.cad_file_id} />
                        <span className="min-w-0">
                          {quote.title && <span className="block max-w-[16rem] truncate text-sm font-semibold text-ink">{quote.title}</span>}
                          <span className="block whitespace-nowrap font-mono text-sm font-medium text-primary-700 dark:text-primary-300">{quote.quote_number}</span>
                          {/* Customer column is hidden below xl; show it here instead. */}
                          <span className="block max-w-[14rem] truncate text-xs text-ink-muted xl:hidden">{quote.customer_name || 'No customer'}</span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden max-w-[12rem] truncate px-4 py-3 text-sm text-ink-secondary xl:table-cell">{quote.customer_name || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-semibold text-ink">
                      {formatCurrency(quote.total_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusPill status={quote.status} />
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 xl:table-cell">
                      <ValidityCell validUntil={quote.valid_until} status={quote.status} />
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-ink-muted 2xl:table-cell">{formatDate(quote.created_at)}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end">
                        <QuoteRowActions quote={quote} downloading={downloadingId === quote.id} onDownload={handleDownload} onDelete={handleDelete} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default QuoteList;
