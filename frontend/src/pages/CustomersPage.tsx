import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2, Search, Users, AlertCircle } from 'lucide-react';
import type { Customer } from '@/types';
import { listCustomers } from '@/services/api';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

const formatDate = (dateString?: string | null) =>
  dateString
    ? new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

const CustomersPage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listCustomers(search || undefined);
        if (!cancelled) setCustomers(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load customers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const timer = setTimeout(load, search ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, retryToken]);

  const totals = useMemo(
    () => ({
      quoted: customers.reduce((sum, c) => sum + Number(c.total_quoted_value), 0),
      quotes: customers.reduce((sum, c) => sum + c.quote_count, 0),
    }),
    [customers],
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-primary-600" />
            Customers
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {customers.length} customer{customers.length === 1 ? '' : 's'} · {totals.quotes} quotes ·{' '}
            {formatCurrency(totals.quoted)} quoted
          </p>
        </div>
        <div className="relative sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company or email"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : error ? (
        // A load failure is not the same as "no customers" — showing the
        // empty state here would look like the account's data disappeared.
        <div className="bg-red-50 border border-red-200 rounded-xl p-12 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="font-semibold text-red-900 mb-1">Couldn't load customers</h2>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => setRetryToken((n) => n + 1)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto" />
          <h2 className="mt-3 font-semibold text-gray-900">
            {search ? 'No customers match your search' : 'No customers yet'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {search
              ? 'Try a different name, company or email.'
              : 'Customers are created automatically when you add their details to a quote.'}
          </p>
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset search
            </button>
          ) : (
            <Link
              to="/quote"
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Create Quote
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3 text-right">Quotes</th>
                  <th className="px-5 py-3 text-right">Total quoted</th>
                  <th className="px-5 py-3 text-right">Won</th>
                  <th className="px-5 py-3">Last activity</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const winPct =
                    customer.quote_count > 0
                      ? Math.round((customer.accepted_count / customer.quote_count) * 100)
                      : null;
                  return (
                    <tr key={customer.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link to={`/customers/${customer.id}`} className="font-medium text-gray-900 hover:text-primary-700">
                          {customer.name}
                        </Link>
                        {customer.company && <p className="text-xs text-gray-500">{customer.company}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{customer.email || customer.phone || '—'}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-900">{customer.quote_count}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-900">
                        {formatCurrency(Number(customer.total_quoted_value))}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {winPct === null ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span className={winPct > 0 ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                            {customer.accepted_count} ({winPct}%)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{formatDate(customer.last_quote_at)}</td>
                      <td className="px-3 py-3.5">
                        <Link to={`/customers/${customer.id}`} aria-label={`Open ${customer.name}`}>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersPage;
