import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate, Link } from 'react-router-dom';
import {
  Cloud, Upload, FolderOpen, FileText,
  ChevronRight, Settings, Loader2, AlertCircle, ShieldCheck, Sparkles,
  Clock, TrendingUp, Inbox,
} from 'lucide-react';
import type { QuoteListItem } from '@/types';
import { listQuotes } from '@/services/api';
import { useAuth } from '@/components/AuthProvider';
import { uploadAndProcessCADFile } from '@/services/uploadWorkflow';
import { createSamplePartFile } from '@/services/samplePart';
import { StatusPill } from '@/components/ui';

interface WeekBucket {
  label: string;
  value: number;
  count: number;
}

const buildWeeklyBuckets = (quotes: QuoteListItem[], weeks = 8): WeekBucket[] => {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday-start weeks
  const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const inWeek = quotes.filter((quote) => {
      const created = new Date(quote.created_at).getTime();
      return created >= start.getTime() && created < end.getTime();
    });
    buckets.push({
      label: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value: inWeek.reduce((sum, quote) => sum + Number(quote.total_price || 0), 0),
      count: inWeek.length,
    });
  }
  return buckets;
};

const compactINR = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

/** Weekly quoted-value bars: single series, baseline-anchored, hover tooltip. */
const QuoteTrendChart = ({ buckets }: { buckets: WeekBucket[] }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const width = 320;
  const height = 116;
  const baseline = 96;
  const plotTop = 14;
  const slot = width / buckets.length;
  const barWidth = 22;
  const maxValue = Math.max(...buckets.map((b) => b.value), 1);
  const maxIndex = buckets.findIndex((b) => b.value === maxValue);

  const barPath = (x: number, barHeight: number) => {
    const r = Math.min(4, barHeight);
    const y = baseline - barHeight;
    const w = barWidth;
    return `M ${x} ${baseline} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${baseline} Z`;
  };

  return (
    <div className="relative">
      {hovered !== null && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
          style={{ left: `${((hovered + 0.5) / buckets.length) * 100}%` }}
        >
          Week of {buckets[hovered].label} · {buckets[hovered].count} quote{buckets[hovered].count === 1 ? '' : 's'} ·{' '}
          {compactINR(buckets[hovered].value)}
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Quoted value per week for the last ${buckets.length} weeks`}
        onMouseLeave={() => setHovered(null)}
      >
        <line x1="0" y1={baseline} x2={width} y2={baseline} className="stroke-slate-200" strokeWidth="1" />
        {buckets.map((bucket, index) => {
          const barHeight = bucket.value > 0 ? Math.max((bucket.value / maxValue) * (baseline - plotTop), 3) : 2;
          const x = index * slot + (slot - barWidth) / 2;
          return (
            <g key={bucket.label}>
              {/* oversized hit target */}
              <rect
                x={index * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
              />
              <path
                d={barPath(x, barHeight)}
                className={
                  bucket.value === 0
                    ? 'fill-slate-200'
                    : hovered === index
                    ? 'fill-sky-700'
                    : 'fill-sky-600'
                }
                style={{ pointerEvents: 'none' }}
              />
              {index === maxIndex && bucket.value > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={baseline - barHeight - 5}
                  textAnchor="middle"
                  className="fill-slate-500 font-mono"
                  fontSize="9"
                >
                  {compactINR(bucket.value)}
                </text>
              )}
            </g>
          );
        })}
        <text x="2" y={height - 4} className="fill-slate-400" fontSize="9">
          {buckets[0]?.label}
        </text>
        <text x={width - 2} y={height - 4} textAnchor="end" className="fill-slate-400" fontSize="9">
          {buckets[buckets.length - 1]?.label}
        </text>
      </svg>
    </div>
  );
};

const HomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isFreePlan = user?.plan !== 'pro';

  // Upload state
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Recent quotes for "Recent uploads" widget
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);

  useEffect(() => {
    listQuotes(0, 50)
      .then(setQuotes)
      .catch(() => {})
      .finally(() => setQuotesLoading(false));
  }, []);

  const uploading = uploadingCount > 0;

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setUploadError(null);
    setUploadingCount(acceptedFiles.length);

    try {
      const processedFiles = await Promise.all(
        acceptedFiles.map((file) => uploadAndProcessCADFile(file))
      );

      navigate('/quote', {
        state: { multiFiles: processedFiles },
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingCount(0);
    }
  }, [navigate]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'model/step': ['.step', '.stp'],
      'model/stl': ['.stl'],
      'application/octet-stream': ['.step', '.stp', '.stl'],
    },
    maxSize: 100 * 1024 * 1024,
    disabled: uploading,
    noClick: true,
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

  // Stats derived from quotes
  const totalParts = quotes.length;
  const totalValue = quotes.reduce((sum, quote) => sum + Number(quote.total_price || 0), 0);
  const now = Date.now();
  const sentCount = quotes.filter((quote) => quote.status === 'sent').length;
  const acceptedCount = quotes.filter((quote) => quote.status === 'accepted').length;
  const declinedCount = quotes.filter((quote) => quote.status === 'declined').length;
  const respondedCount = acceptedCount + declinedCount;
  const winRate = respondedCount > 0 ? Math.round((acceptedCount / respondedCount) * 100) : null;

  const expiringQuotes = useMemo(
    () =>
      quotes
        .filter((quote) => {
          if (['expired', 'accepted', 'declined'].includes(quote.status)) return false;
          const validUntil = new Date(quote.valid_until).getTime();
          return validUntil > now && validUntil - now < 7 * 86400000;
        })
        .sort((a, b) => new Date(a.valid_until).getTime() - new Date(b.valid_until).getTime()),
    [quotes, now],
  );
  const expiringSoon = expiringQuotes.length;

  const recentResponses = useMemo(
    () =>
      quotes
        .filter((quote) => quote.status === 'accepted' || quote.status === 'declined')
        .sort((a, b) =>
          new Date(b.responded_at ?? b.created_at).getTime() - new Date(a.responded_at ?? a.created_at).getTime()),
    [quotes],
  );

  const weeklyBuckets = useMemo(() => buildWeeklyBuckets(quotes), [quotes]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <section className="surface-strong rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative animate-fade-up">
        <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-sky-300/30 blur-3xl animate-float-soft" />
        <div className="absolute -left-20 bottom-0 w-56 h-56 rounded-full bg-orange-300/20 blur-3xl animate-float-soft" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 p-6 sm:p-8 lg:p-10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              Precision Quoting Workspace
            </div>

            <div>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-tight text-slate-900">
                Build CNC quotes
                <span className="block text-slate-600">without the spreadsheet grind.</span>
              </h1>
              <p className="text-slate-600 mt-4 max-w-2xl text-sm sm:text-base">
                Drop one or many CAD files, get geometry analysis, per-part pricing, and lead-time estimates in one flow.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">Quotes</p>
                <p className="font-display text-2xl text-slate-900">{totalParts}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">Quoted Value</p>
                <p className="font-display text-2xl text-slate-900">{formatCurrency(totalValue)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">Sent to Customers</p>
                <p className="font-display text-2xl text-slate-900">{sentCount}</p>
              </div>
              <div className={`rounded-2xl border p-3 ${winRate !== null ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <p className={`text-[11px] ${winRate !== null ? 'text-emerald-700' : 'text-slate-500'}`}>Win rate</p>
                <p className="font-display text-2xl text-slate-900">{winRate !== null ? `${winRate}%` : '—'}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Secure uploads
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100">
                <Upload className="w-3.5 h-3.5 text-sky-600" />
                STEP, STP, STL up to 100MB each
              </span>
            </div>
          </div>

          <div
            {...getRootProps()}
            className={`rounded-3xl border-2 border-dashed p-6 sm:p-8 min-h-[330px] flex flex-col justify-center text-center transition-colors cursor-default ${
              isDragActive
                ? 'border-sky-400 bg-sky-50'
                : uploading
                ? 'border-slate-200 bg-slate-50'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <input {...getInputProps()} />

            {uploading ? (
              <div className="space-y-3">
                <Loader2 className="w-10 h-10 text-sky-600 animate-spin mx-auto" />
                <p className="font-medium text-slate-700">Analyzing geometry...</p>
                <p className="text-sm text-slate-500">This usually takes a few seconds per file.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative w-fit mx-auto">
                  <Cloud className="w-14 h-14 text-slate-400" />
                  <Upload className="w-5 h-5 text-sky-600 absolute -bottom-1 -right-1" />
                </div>

                <p className="text-slate-700 font-medium">
                  {isDragActive ? 'Release files to start upload' : 'Drag and drop CAD files here'}
                </p>

                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={open}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                  >
                    Upload Files
                  </button>
                  <button
                    type="button"
                    onClick={() => onDrop([createSamplePartFile()])}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Try a sample part
                  </button>
                </div>

                <p className="text-xs text-slate-500">Single and multi-file uploads both open the same quote builder flow.</p>

                {isFreePlan && (
                  <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                    Free plan: only the sample part can be quoted.{' '}
                    <Link to="/billing" className="font-semibold underline">
                      Upgrade
                    </Link>{' '}
                    to quote your own CAD files.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {uploadError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 animate-fade-up">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Upload failed</p>
            <p className="text-xs text-red-600 mt-0.5">{uploadError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6">
        <section className="surface-strong rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                <FolderOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-xl text-slate-900">Recent Quote Activity</h2>
                <p className="text-xs text-slate-500">Track your latest generated quotes.</p>
              </div>
            </div>

            <Link to="/quotes" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
              All quotes
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {quotesLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : quotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-slate-600 font-medium">No quotes yet.</p>
              <p className="text-sm text-slate-500 mt-1">Upload your first file to start building estimates.</p>
              <button
                type="button"
                onClick={() => onDrop([createSamplePartFile()])}
                disabled={uploading}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Quote a sample part
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {quotes.slice(0, 5).map((quote, index) => (
                <li key={quote.id}>
                  <Link
                    to={`/quotes/${quote.id}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 hover:border-slate-300 hover:shadow-sm transition-all"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{quote.quote_number}</p>
                        <p className="text-xs text-slate-500">{new Date(quote.created_at).toLocaleDateString('en-IN')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 ml-3 shrink-0">
                      <StatusPill status={quote.status} />
                      <span className="text-sm font-semibold font-mono text-slate-700">{formatCurrency(quote.total_price)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="surface-strong rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-xl text-slate-900">Quoted Value</h2>
                  <p className="text-xs text-slate-500">Last 8 weeks · {sentCount} sent{winRate !== null ? ` · ${winRate}% win rate` : ''}</p>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <QuoteTrendChart buckets={weeklyBuckets} />
            </div>
          </section>

          <section className="surface-strong rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 animate-fade-up">
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${recentResponses[0]?.status === 'accepted' ? 'bg-emerald-600' : 'bg-slate-900'}`}>
                <Inbox className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-xl text-slate-900">Customer Responses</h2>
                <p className="text-xs text-slate-500">Quotes your customers accepted or declined via the share link.</p>
              </div>
            </div>

            {recentResponses.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                No responses yet — share a quote link to hear back here.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentResponses.slice(0, 4).map((quote) => {
                  const accepted = quote.status === 'accepted';
                  return (
                    <li key={quote.id}>
                      <Link
                        to={`/quotes/${quote.id}`}
                        className={`block rounded-xl border px-3 py-2.5 hover:shadow-sm transition-all ${
                          accepted
                            ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300'
                            : 'border-red-200 bg-red-50/50 hover:border-red-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate text-sm">{quote.quote_number}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {quote.customer_name || 'No customer'} · {formatCurrency(quote.total_price)}
                            </p>
                          </div>
                          <span
                            className={`ml-3 shrink-0 rounded-full border bg-white px-2 py-0.5 text-[11px] font-semibold ${
                              accepted ? 'border-emerald-300 text-emerald-700' : 'border-red-300 text-red-700'
                            }`}
                          >
                            {accepted ? 'Accepted' : 'Declined'}
                            {quote.responded_at ? ` · ${new Date(quote.responded_at).toLocaleDateString('en-IN')}` : ''}
                          </span>
                        </div>
                        {quote.customer_response_note && (
                          <p className="mt-1.5 text-xs text-slate-600 italic truncate">“{quote.customer_response_note}”</p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="surface-strong rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 animate-fade-up">
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${expiringSoon > 0 ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'}`}>
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-xl text-slate-900">Expiring Soon</h2>
                <p className="text-xs text-slate-500">Open quotes lapsing within 7 days — worth a follow-up.</p>
              </div>
            </div>

            {expiringQuotes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                Nothing expiring this week.
              </p>
            ) : (
              <ul className="space-y-2">
                {expiringQuotes.slice(0, 4).map((quote) => {
                  const daysLeft = Math.ceil((new Date(quote.valid_until).getTime() - now) / 86400000);
                  return (
                    <li key={quote.id}>
                      <Link
                        to={`/quotes/${quote.id}`}
                        className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 hover:border-amber-300 hover:shadow-sm transition-all"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate text-sm">{quote.quote_number}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {quote.customer_name || 'No customer'} · {formatCurrency(quote.total_price)}
                          </p>
                        </div>
                        <span className="ml-3 shrink-0 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="surface-strong rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 animate-fade-up">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-xl text-slate-900">Pricing Control Center</h2>
                <p className="text-xs text-slate-500 mt-1">Tune material rates, finish fees, and machine pricing in one place.</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                <Settings className="w-4 h-4" />
              </div>
            </div>

            <Link
              to="/admin/pricing"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Go to Cost Master
              <ChevronRight className="w-4 h-4" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
