import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search, Users, AlertCircle } from 'lucide-react';
import type { Customer } from '@/types';
import { listCustomers } from '@/services/api';

import { Button, Input, SkeletonList, buttonClasses } from '@/components/ui';
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
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2.5">
            <Users className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            Customers
          </h1>
          <p className="text-ink-muted text-sm mt-0.5">
            {customers.length} customer{customers.length === 1 ? '' : 's'} · {totals.quotes} quotes ·{' '}
            {formatCurrency(totals.quoted)} quoted
          </p>
        </div>
        <div className="relative sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-subtle" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company or email" className="w-full pl-9 pr-3"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : error ? (
        // A load failure is not the same as "no customers" — showing the
        // empty state here would look like the account's data disappeared.
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-12 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="font-semibold text-red-900 dark:text-red-300 mb-1">Couldn't load customers</h2>
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">{error}</p>
          <Button variant="danger"
            onClick={() => setRetryToken((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-surface rounded-xl border border-edge p-12 text-center">
          <Users className="w-10 h-10 text-ink-subtle mx-auto" />
          <h2 className="mt-3 font-semibold text-ink">
            {search ? 'No customers match your search' : 'No customers yet'}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {search
              ? 'Try a different name, company or email.'
              : 'Customers are created automatically when you add their details to a quote.'}
          </p>
          {search ? (
            <Button variant="secondary" className="mt-4"
              onClick={() => setSearch('')}
            >
              Reset search
            </Button>
          ) : (
            <Link
              to="/quote" className={buttonClasses('primary', 'md', 'mt-4')}
            >
              Create Quote
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-edge overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-edge text-xs font-semibold uppercase tracking-wider text-ink-muted">
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
                    <tr key={customer.id} className="border-b border-edge last:border-0 hover:bg-surface-muted transition-colors">
                      <td className="px-5 py-3.5">
                        <Link to={`/customers/${customer.id}`} className="font-medium text-ink hover:text-primary-700 dark:hover:text-primary-300">
                          {customer.name}
                        </Link>
                        {customer.company && <p className="text-xs text-ink-muted">{customer.company}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-ink-secondary">{customer.email || customer.phone || '—'}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-ink">{customer.quote_count}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-ink">
                        {formatCurrency(Number(customer.total_quoted_value))}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {winPct === null ? (
                          <span className="text-ink-subtle">—</span>
                        ) : (
                          <span className={winPct > 0 ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-ink-muted'}>
                            {customer.accepted_count} ({winPct}%)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-ink-secondary">{formatDate(customer.last_quote_at)}</td>
                      <td className="px-3 py-3.5">
                        <Link to={`/customers/${customer.id}`} aria-label={`Open ${customer.name}`}>
                          <ChevronRight className="w-4 h-4 text-ink-subtle" />
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
