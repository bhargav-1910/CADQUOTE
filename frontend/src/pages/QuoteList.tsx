import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, Loader2, AlertCircle, CheckCircle, ChevronRight, Home, Search, Pencil, Eye, Download } from 'lucide-react';
import type { QuoteListItem } from '@/types';
import { listQuotes, downloadQuotePDF } from '@/services/api';

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

const statusPillClass = (status: string) => {
  switch (status) {
    case 'generated':
      return 'bg-primary-50 text-primary-700 border-primary-200';
    case 'sent':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'accepted':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'declined':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'expired':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

/** Validity cell: countdown chip when close to expiry, plain date otherwise. */
const ValidityCell = ({ validUntil, status }: { validUntil: string; status: string }) => {
  const expiry = new Date(validUntil).getTime();
  const daysLeft = Math.ceil((expiry - Date.now()) / 86400000);
  if (status === 'accepted' || status === 'declined') {
    return <span className="text-sm text-gray-600">{formatDate(validUntil)}</span>;
  }
  const expired = status === 'expired' || daysLeft <= 0;

  if (expired) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        Expired {formatDate(validUntil)}
      </span>
    );
  }
  if (daysLeft <= 5) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        {daysLeft} day{daysLeft === 1 ? '' : 's'} left
      </span>
    );
  }
  return <span className="text-sm text-gray-600">{formatDate(validUntil)}</span>;
};

const QuoteList = () => {
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const batchResult = location.state as { batchIds?: string[]; batchTotal?: number } | null;

  useEffect(() => {
    listQuotes(0, 200)
      .then(setQuotes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load quotes'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (statusFilter !== 'all' && quote.status !== statusFilter) return false;
      if (!q) return true;
      return (
        quote.quote_number.toLowerCase().includes(q) ||
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/workspace" className="flex items-center gap-1 hover:text-gray-900 transition-colors">
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">My Quotes</span>
      </nav>

      {/* Batch success banner */}
      {batchResult?.batchIds && batchResult.batchIds.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-900">
              {batchResult.batchIds.length} quotes created successfully!
            </p>
            {batchResult.batchTotal !== undefined && (
              <p className="text-sm text-green-700">
                Combined total: {formatCurrency(Number(batchResult.batchTotal))}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
          <p className="text-gray-600 text-sm">
            {quotes.length} total · {formatCurrency(totalFilteredValue)} in view
          </p>
        </div>
        <Link
          to="/quote"
          className="inline-flex w-fit items-center gap-2 px-4 py-2.5 bg-accent-400 text-slate-950 font-semibold rounded-xl hover:bg-accent-300 shadow-lg shadow-accent-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Quote
        </Link>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by quote number or customer…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {label}
              {statusCounts[value] !== undefined && (
                <span className={`ml-1.5 ${statusFilter === value ? 'text-gray-300' : 'text-gray-400'}`}>
                  {statusCounts[value] ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded" />
              <div className="h-4 w-28 bg-gray-100 rounded" />
              <div className="h-4 w-24 bg-gray-100 rounded ml-auto" />
              <div className="h-5 w-16 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {quotes.length === 0 ? 'No quotes yet' : 'No quotes match your filters'}
          </h2>
          <p className="text-gray-600 mb-6">
            {quotes.length === 0
              ? 'Create your first quote by uploading a CAD file'
              : 'Try a different search term or status filter'}
          </p>
          {quotes.length === 0 && (
            <Link
              to="/quote"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Quote
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Quote #</th>
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Customer</th>
                <th className="text-right px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>
                <th className="text-center px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Validity</th>
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Created</th>
                <th className="text-right px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((quote) => (
                <tr
                  key={quote.id}
                  className="hover:bg-gray-50 cursor-pointer group"
                  onClick={() => navigate(`/quotes/${quote.id}`)}
                >
                  <td className="px-6 py-3.5">
                    <span className="font-medium font-mono text-sm text-primary-700">{quote.quote_number}</span>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-gray-700">{quote.customer_name || '—'}</td>
                  <td className="px-6 py-3.5 text-right font-semibold font-mono text-sm text-gray-900">
                    {formatCurrency(quote.total_price)}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize border ${statusPillClass(quote.status)}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <ValidityCell validUntil={quote.valid_until} status={quote.status} />
                  </td>
                  <td className="px-6 py-3.5 text-sm text-gray-500">{formatDate(quote.created_at)}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        to={`/quotes/${quote.id}`}
                        onClick={(event) => event.stopPropagation()}
                        title="View"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-900"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                      <Link
                        to={`/quote/${quote.id}/edit`}
                        onClick={(event) => event.stopPropagation()}
                        title="Edit in configure"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-900"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={(event) => handleDownload(event, quote)}
                        title="Download PDF"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-900"
                      >
                        {downloadingId === quote.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default QuoteList;
