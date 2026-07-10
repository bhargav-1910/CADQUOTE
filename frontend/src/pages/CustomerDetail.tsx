import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle, Building2, ChevronRight, Clock, FileText, Home, Loader2,
  Mail, Pencil, Phone, Receipt, Users, X,
} from 'lucide-react';
import type { Customer, CustomerUpdateRequest, QuoteListItem } from '@/types';
import { getCustomer, getCustomerQuotes, updateCustomer } from '@/services/api';
import { StatusPill } from '@/components/ui';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const EXPIRY_WINDOW_DAYS = 7;

const CustomerDetail = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CustomerUpdateRequest>({});

  useEffect(() => {
    const load = async () => {
      if (!customerId) return;
      setLoading(true);
      try {
        const [customerData, quoteData] = await Promise.all([
          getCustomer(customerId),
          getCustomerQuotes(customerId),
        ]);
        setCustomer(customerData);
        setQuotes(quoteData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customer');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [customerId]);

  const startEdit = () => {
    if (!customer) return;
    setForm({
      name: customer.name,
      email: customer.email ?? '',
      company: customer.company ?? '',
      phone: customer.phone ?? '',
      gstin: customer.gstin ?? '',
      notes: customer.notes ?? '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!customer) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCustomer(customer.id, form);
      setCustomer(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-red-800">Error Loading Customer</h2>
            <p className="text-red-600 mt-1">{error || 'Customer not found'}</p>
            <Link to="/customers" className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-red-700 hover:text-red-800">
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back to Customers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const expiringSoon = quotes.filter((q) => {
    if (q.status !== 'sent' && q.status !== 'generated') return false;
    const validUntil = new Date(q.valid_until).getTime();
    return validUntil > now && validUntil - now < EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  });
  const winPct = customer.quote_count > 0 ? Math.round((customer.accepted_count / customer.quote_count) * 100) : 0;

  const contactRows: Array<{ icon: typeof Mail; label: string; value?: string | null }> = [
    { icon: Mail, label: 'Email', value: customer.email },
    { icon: Phone, label: 'Phone', value: customer.phone },
    { icon: Building2, label: 'Company', value: customer.company },
    { icon: Receipt, label: 'GSTIN', value: customer.gstin },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/workspace" className="flex items-center gap-1 hover:text-gray-900 transition-colors">
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/customers" className="hover:text-gray-900 transition-colors">Customers</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">{customer.name}</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-primary-600" />
            {customer.name}
          </h1>
          {customer.company && <p className="text-gray-500 text-sm mt-0.5">{customer.company}</p>}
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <Pencil className="w-4 h-4" />
            Edit details
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total quoted', value: formatCurrency(Number(customer.total_quoted_value)) },
          { label: 'Quotes', value: String(customer.quote_count) },
          {
            label: 'Won',
            value: customer.quote_count > 0 ? `${customer.accepted_count} (${winPct}%)` : '—',
            tone: customer.accepted_count > 0 ? 'text-emerald-700' : undefined,
          },
          {
            label: 'Expiring within 7 days',
            value: String(expiringSoon.length),
            tone: expiringSoon.length > 0 ? 'text-amber-700' : undefined,
          },
        ].map(({ label, value, tone }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            <p className={`mt-1.5 text-xl font-bold ${tone ?? 'text-gray-900'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Contact card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
            {editing && (
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600" aria-label="Cancel edit">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              {(
                [
                  ['name', 'Name'],
                  ['email', 'Email'],
                  ['company', 'Company'],
                  ['phone', 'Phone'],
                  ['gstin', 'GSTIN'],
                ] as Array<[keyof CustomerUpdateRequest, string]>
              ).map(([field, label]) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type="text"
                    value={(form[field] as string) ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <button
                onClick={saveEdit}
                disabled={saving || !form.name?.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save changes
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {contactRows.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-medium text-gray-900">{value || 'Not specified'}</p>
                  </div>
                </div>
              ))}
              {customer.notes && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quote timeline */}
        <div className="lg:col-span-2 space-y-4">
          {expiringSoon.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Clock className="w-4 h-4" />
                {expiringSoon.length} quote{expiringSoon.length === 1 ? '' : 's'} expiring within {EXPIRY_WINDOW_DAYS} days
              </p>
              <div className="mt-2 space-y-1">
                {expiringSoon.map((q) => (
                  <Link key={q.id} to={`/quotes/${q.id}`} className="block text-sm text-amber-700 hover:text-amber-900 hover:underline">
                    {q.quote_number} · {formatCurrency(Number(q.total_price))} · valid until {formatDate(q.valid_until)}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Quote history</h2>
            </div>
            {quotes.length === 0 ? (
              <div className="p-10 text-center">
                <FileText className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="mt-2 text-sm text-gray-500">No quotes yet for this customer.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {quotes.map((quote) => (
                  <li key={quote.id}>
                    <Link
                      to={`/quotes/${quote.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{quote.quote_number}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(quote.created_at)} · valid until {formatDate(quote.valid_until)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="font-semibold text-gray-900">{formatCurrency(Number(quote.total_price))}</span>
                        <StatusPill status={quote.status} />
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerDetail;
