/**
 * Customer-facing quote page, reached via an unguessable share link (/q/:token).
 * No login required. Shows the offer, lets the customer accept or decline,
 * and never exposes internal cost or margin data.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Factory,
  Mail,
  Phone,
  XCircle,
} from 'lucide-react';
import { getPublicQuote, respondToPublicQuote, getPublicQuotePdfUrl } from '@/services/api';
import type { PublicQuote } from '@/types';
import { Button, Card, SectionLabel, Skeleton, StatusPill } from '@/components/ui';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const daysUntil = (value: string) => {
  const ms = new Date(value).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const PublicQuotePage = () => {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [responding, setResponding] = useState<'accept' | 'decline' | null>(null);
  const [confirming, setConfirming] = useState<'accept' | 'decline' | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getPublicQuote(token)
      .then((data) => {
        if (!cancelled) setQuote(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError('This quote link is invalid or no longer available.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const respond = useCallback(
    async (action: 'accept' | 'decline') => {
      if (!token) return;
      setResponding(action);
      setRespondError(null);
      try {
        const updated = await respondToPublicQuote(token, action, note.trim() || undefined);
        setQuote(updated);
        setConfirming(null);
      } catch (error: any) {
        setRespondError(
          error?.response?.data?.detail ?? 'Could not record your response. Please try again.',
        );
      } finally {
        setResponding(null);
      }
    },
    [token, note],
  );

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-slate-100 px-4 py-10">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (loadError || !quote) {
    return (
      <div className="min-h-[100dvh] bg-slate-100 flex items-center justify-center px-4">
        <Card className="max-w-md text-center">
          <XCircle className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="mt-3 font-display text-xl font-semibold text-slate-900">Quote not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            {loadError ?? 'This quote link is invalid or no longer available.'}
            {' '}Ask your supplier to send a new link.
          </p>
        </Card>
      </div>
    );
  }

  const isOpen = !['accepted', 'declined', 'expired'].includes(quote.status);
  const validDays = daysUntil(quote.valid_until);
  const brand = quote.seller.brand_color || '#0f172a';

  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
      {/* Seller masthead */}
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: brand }}
            >
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display font-semibold leading-none">{quote.seller.company_name}</p>
              <p className="mt-1 text-[11px] leading-none text-slate-500">Quotation {quote.quote_number}</p>
            </div>
          </div>
          <StatusPill status={quote.status} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8 sm:px-6">
        {/* Response banners */}
        {quote.status === 'accepted' && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-900">Quote accepted</p>
              <p className="mt-0.5 text-sm text-emerald-800">
                {quote.seller.company_name} has been notified and will follow up on the order
                {quote.responded_at ? ` · ${formatDate(quote.responded_at)}` : ''}.
              </p>
            </div>
          </div>
        )}
        {quote.status === 'declined' && (
          <div className="flex items-start gap-3 rounded-2xl border border-slate-300 bg-white p-5">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            <div>
              <p className="font-semibold text-slate-900">Quote declined</p>
              <p className="mt-0.5 text-sm text-slate-600">
                Your response was recorded{quote.responded_at ? ` on ${formatDate(quote.responded_at)}` : ''}.
                If circumstances change, contact {quote.seller.company_name} for a revised offer.
              </p>
            </div>
          </div>
        )}
        {quote.status === 'expired' && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">This quote has expired</p>
              <p className="mt-0.5 text-sm text-amber-800">
                Pricing was valid until {formatDate(quote.valid_until)}. Contact{' '}
                {quote.seller.company_name} to request an updated quotation.
              </p>
            </div>
          </div>
        )}

        {/* Offer */}
        <Card padded={false} className="overflow-hidden">
          <div
            className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 text-white"
            style={{ background: `linear-gradient(105deg, #0f172a 0%, #0f172a 55%, ${brand} 160%)` }}
          >
            <div>
              <SectionLabel className="!text-sky-300">Quotation</SectionLabel>
              <p className="mt-1 font-mono text-lg font-semibold">{quote.quote_number}</p>
              <p className="mt-1 text-xs text-slate-400">
                Prepared for {quote.customer_name || quote.customer_company || 'you'} ·{' '}
                {formatDate(quote.created_at)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Total (excl. taxes as noted)</p>
              <p className="font-display text-3xl font-semibold">{formatCurrency(quote.total_price)}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Lead time ≈ {Math.round(quote.estimated_lead_time_days)} working days
              </p>
            </div>
          </div>

          {/* Line items */}
          <div className="px-6 py-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="pb-2">Part</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit price</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {quote.line_items.map((item, index) => (
                  <tr key={`${item.part_name}-${index}`} className="border-t border-slate-100">
                    <td className="py-2.5 pr-4">
                      <span className="flex items-center gap-2 font-medium text-slate-800">
                        <Box className="h-4 w-4 shrink-0 text-slate-400" />
                        {item.part_name}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-600">{item.quantity}</td>
                    <td className="py-2.5 text-right font-mono text-slate-600">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={3} className="py-3 text-right text-sm font-semibold text-slate-700">
                    Grand total
                  </td>
                  <td className="py-3 text-right font-mono text-base font-bold text-slate-900">
                    {formatCurrency(quote.total_price)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Specification chips */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {quote.material_name && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {quote.material_name}
                </span>
              )}
              {quote.surface_finish_name && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {quote.surface_finish_name}
                </span>
              )}
              {quote.inspection_level_name && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {quote.inspection_level_name}
                </span>
              )}
              {quote.tolerance_notes && (
                <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                  {quote.tolerance_notes}
                </span>
              )}
            </div>
          </div>

          {/* Commercial terms */}
          <div className="grid gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Valid until', `${formatDate(quote.valid_until)}${isOpen && validDays > 0 ? ` · ${validDays} day${validDays === 1 ? '' : 's'} left` : ''}`],
              ['Payment terms', quote.payment_terms || '—'],
              ['Delivery', quote.delivery || '—'],
              ['GST', quote.gst || '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-6 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-0.5 text-sm text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Respond */}
        {isOpen && (
          <Card>
            <h2 className="font-display text-lg font-semibold text-slate-900">Respond to this quote</h2>
            <p className="mt-1 text-sm text-slate-600">
              Accepting notifies {quote.seller.company_name} that you want to proceed with the order.
            </p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Add a note for the supplier (optional)"
              className="mt-4 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {respondError && <p className="mt-2 text-sm text-red-600">{respondError}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {confirming ? (
                <>
                  <p className="text-sm font-medium text-slate-700">
                    {confirming === 'accept' ? 'Accept this quote?' : 'Decline this quote?'}
                  </p>
                  <Button
                    variant={confirming === 'accept' ? 'success' : 'danger'}
                    loading={responding !== null}
                    onClick={() => respond(confirming)}
                  >
                    Yes, {confirming}
                  </Button>
                  <Button variant="secondary" disabled={responding !== null} onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="success"
                    size="lg"
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={() => setConfirming('accept')}
                  >
                    Accept quote
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => setConfirming('decline')}>
                    Decline
                  </Button>
                </>
              )}
            </div>
          </Card>
        )}

        {/* Documents + contact */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-slate-900">Documents</h3>
            <a href={getPublicQuotePdfUrl(token!)} target="_blank" rel="noreferrer" className="mt-3 block">
              <Button variant="secondary" icon={<Download className="h-4 w-4" />}>
                Download quote PDF
              </Button>
            </a>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-slate-900">Questions?</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {quote.seller.contact_name && (
                <p className="font-medium text-slate-800">{quote.seller.contact_name}</p>
              )}
              {quote.seller.email && (
                <a
                  href={`mailto:${quote.seller.email}?subject=Re: Quotation ${quote.quote_number}`}
                  className="flex items-center gap-2 text-primary-700 hover:underline"
                >
                  <Mail className="h-4 w-4" />
                  {quote.seller.email}
                </a>
              )}
              {quote.seller.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" />
                  {quote.seller.phone}
                </p>
              )}
            </div>
          </Card>
        </div>

        <p className="flex items-center justify-center gap-1.5 pb-4 pt-2 text-xs text-slate-400">
          <Calendar className="h-3.5 w-3.5" />
          Issued {formatDate(quote.created_at)} · Powered by ForgeQuote
        </p>
      </main>
    </div>
  );
};

export default PublicQuotePage;
