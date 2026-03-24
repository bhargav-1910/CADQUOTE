import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, Clock, Loader2, AlertCircle, CheckCircle, ChevronRight, Home } from 'lucide-react';
import type { QuoteListItem } from '@/types';
import { listQuotes } from '@/services/api';

const QuoteList = () => {
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const batchResult = location.state as { batchIds?: string[]; batchTotal?: number } | null;

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const data = await listQuotes();
        setQuotes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load quotes');
      } finally {
        setLoading(false);
      }
    };

    fetchQuotes();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'generated':
        return 'bg-green-100 text-green-700';
      case 'sent':
        return 'bg-blue-100 text-blue-700';
      case 'expired':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  const isExpired = (validUntil: string) => {
    return new Date(validUntil) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
          <p className="text-gray-600">View and manage your quotations</p>
        </div>
        <Link
          to="/quote"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Quote
        </Link>
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

      {/* Quotes list */}
      {quotes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No quotes yet</h2>
          <p className="text-gray-600 mb-6">
            Create your first quote by uploading a CAD file
          </p>
          <Link
            to="/quote"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Quote
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">
                  Quote #
                </th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">
                  Customer
                </th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">
                  Total
                </th>
                <th className="text-center px-6 py-3 text-sm font-semibold text-gray-600">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">
                  Valid Until
                </th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotes.map((quote) => (
                <tr
                  key={quote.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/quotes/${quote.id}`)}
                >
                  <td className="px-6 py-4">
                    <Link
                      to={`/quotes/${quote.id}`}
                      className="font-medium text-primary-600 hover:text-primary-700"
                    >
                      {quote.quote_number}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    {quote.customer_name || '—'}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
                    {formatCurrency(quote.total_price)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(
                        quote.status
                      )}`}
                    >
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      {isExpired(quote.valid_until) && (
                        <Clock className="w-3.5 h-3.5 text-red-500" />
                      )}
                      <span className={isExpired(quote.valid_until) ? 'text-red-600' : ''}>
                        {formatDate(quote.valid_until)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(quote.created_at)}
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
