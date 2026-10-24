import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate, Link } from 'react-router-dom';
import {
  Cloud, Upload, FolderOpen,
  ChevronRight, Settings, Loader2, AlertCircle, ShieldCheck, Sparkles,
  Clock, TrendingUp, Inbox, CheckCircle2, Circle, X,
} from 'lucide-react';
import type { QuoteListItem } from '@/types';
import { listQuotes } from '@/services/api';
import { useAuth } from '@/components/AuthProvider';
import PartThumbnail from '@/components/PartThumbnail';
import { uploadAndProcessCADFile } from '@/services/uploadWorkflow';
import { createSamplePartFile } from '@/services/samplePart';
import { Button, SkeletonList, StatusPill } from '@/components/ui';

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
        <line x1="0" y1={baseline} x2={width} y2={baseline} className="stroke-edge" strokeWidth="1" />
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
                    ? 'fill-fill'
                    : hovered === index
                    ? 'fill-primary-700'
                    : 'fill-primary-600'
                }
                style={{ pointerEvents: 'none' }}
              />
              {index === maxIndex && bucket.value > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={baseline - barHeight - 5}
                  textAnchor="middle"
                  className="fill-ink-muted font-mono"
                  fontSize="9"
                >
                  {compactINR(bucket.value)}
                </text>
              )}
            </g>
          );
        })}
        <text x="2" y={height - 4} className="fill-ink-subtle" fontSize="9">
          {buckets[0]?.label}
        </text>
        <text x={width - 2} y={height - 4} textAnchor="end" className="fill-ink-subtle" fontSize="9">
          {buckets[buckets.length - 1]?.label}
        </text>
      </svg>
    </div>
  );
};

const ONBOARDING_DISMISSED_KEY = 'fq-onboarding-dismissed';

const HomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isFreePlan = user?.plan !== 'pro';
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1',
  );

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    setOnboardingDismissed(true);
  };

  // Upload state
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Recent quotes for "Recent uploads" widget
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  const loadRecentQuotes = () => {
    setQuotesLoading(true);
    setQuotesError(null);
    listQuotes(0, 50)
      .then(setQuotes)
      .catch((err) => setQuotesError(err instanceof Error ? err.message : 'Failed to load quotes'))
      .finally(() => setQuotesLoading(false));
  };

  useEffect(() => {
    loadRecentQuotes();
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
      <section className="surface-strong rounded-2xl border border-edge shadow-sm overflow-hidden relative animate-fade-up">
        <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-primary-300/30 blur-3xl animate-float-soft" />
        <div className="absolute -left-20 bottom-0 w-56 h-56 rounded-full bg-orange-300/20 blur-3xl animate-float-soft" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 p-6 sm:p-8 lg:p-10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink text-surface text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              Precision Quoting Workspace
            </div>

            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl leading-tight text-ink">
                Build CNC quotes
                <span className="block text-ink-secondary">without the spreadsheet grind.</span>
              </h1>
              <p className="text-ink-secondary mt-4 max-w-2xl text-sm sm:text-base">
                Drop one or many CAD files, get geometry analysis, per-part pricing, and lead-time estimates in one flow.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-edge bg-surface p-3">
                <p className="text-[11px] text-ink-muted">Quotes</p>
                <p className="text-2xl text-ink">{totalParts}</p>
              </div>
              <div className="rounded-2xl border border-edge bg-surface p-3">
                <p className="text-[11px] text-ink-muted">Quoted Value</p>
                <p className="text-2xl text-ink">{formatCurrency(totalValue)}</p>
              </div>
              <div className="rounded-2xl border border-edge bg-surface p-3">
                <p className="text-[11px] text-ink-muted">Sent to Customers</p>
                <p className="text-2xl text-ink">{sentCount}</p>
              </div>
              <div className={`rounded-2xl border p-3 ${winRate !== null ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10' : 'border-edge bg-surface'}`}>
                <p className={`text-[11px] ${winRate !== null ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink-muted'}`}>Win rate</p>
                <p className="text-2xl text-ink">{winRate !== null ? `${winRate}%` : '—'}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-raised">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Secure uploads
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-raised">
                <Upload className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                STEP, STP, STL up to 100MB each
              </span>
            </div>
          </div>

          <div
            {...getRootProps()}
            className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 min-h-[330px] flex flex-col justify-center text-center transition-colors cursor-default ${
              isDragActive
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-500/10'
                : uploading
                ? 'border-edge bg-surface-muted'
                : 'border-edge-strong bg-surface hover:border-edge-strong'
            }`}
          >
            <input {...getInputProps()} />

            {uploading ? (
              <div className="space-y-3">
                <Loader2 className="w-10 h-10 text-primary-600 dark:text-primary-400 animate-spin mx-auto" />
                <p className="font-medium text-ink-secondary">Analyzing geometry...</p>
                <p className="text-sm text-ink-muted">This usually takes a few seconds per file.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative w-fit mx-auto">
                  <Cloud className="w-14 h-14 text-ink-subtle" />
                  <Upload className="w-5 h-5 text-primary-600 dark:text-primary-400 absolute -bottom-1 -right-1" />
                </div>

                <p className="text-ink-secondary font-medium">
                  {isDragActive ? 'Release files to start upload' : 'Drag and drop CAD files here'}
                </p>

                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={open}
                    className="px-4 py-2 rounded-xl bg-ink text-surface text-sm font-semibold hover:bg-ink/85 transition-colors"
                  >
                    Upload Files
                  </button>
                  <Button variant="secondary"
                    onClick={() => onDrop([createSamplePartFile()])}
                  >
                    Try a sample part
                  </Button>
                </div>

                <p className="text-xs text-ink-muted">Single and multi-file uploads both open the same quote builder flow.</p>

                {isFreePlan && (
                  <p className="text-xs text-primary-800 dark:text-primary-300 bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/30 rounded-lg px-3 py-2">
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

      {/* Profile completion nudge — until the company address is filled the
          PDFs ship with a placeholder address */}
      {user && !user.company_address?.trim() && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-5 py-4 animate-fade-up">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Complete your company profile</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Your quote PDFs currently show a placeholder address. Add your address, logo, and GSTIN so
                customers see your letterhead.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('profile:open'))}
            className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            Complete profile
          </button>
        </section>
      )}

      {/* Onboarding checklist — until the user has been through the full loop once */}
      {!quotesLoading && !onboardingDismissed && respondedCount === 0 && (
        <section className="surface-strong rounded-2xl border border-edge p-5 animate-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg text-ink">Get to your first won quote</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Three steps to see the whole flow — takes about two minutes.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissOnboarding}
              aria-label="Dismiss checklist"
              className="text-ink-subtle hover:text-ink-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: 'Create your first quote',
                detail: 'Use the sample part — no CAD file needed.',
                done: totalParts > 0,
                action: totalParts === 0 ? () => onDrop([createSamplePartFile()]) : undefined,
                actionLabel: 'Quote sample part',
              },
              {
                label: 'Share it with a customer',
                detail: 'Open a quote and copy its customer link.',
                done: sentCount + respondedCount > 0,
                action: totalParts > 0 && sentCount + respondedCount === 0 ? () => navigate('/quotes') : undefined,
                actionLabel: 'Open my quotes',
              },
              {
                label: 'Get a response',
                detail: 'The customer accepts or declines right on the link.',
                done: respondedCount > 0,
              },
            ].map((step, index) => (
              <div
                key={step.label}
                className={`rounded-xl border p-3.5 ${
                  step.done ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10' : 'border-edge bg-surface'
                }`}
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-ink-subtle shrink-0" />
                  )}
                  {index + 1}. {step.label}
                </p>
                <p className="mt-1 text-xs text-ink-muted">{step.detail}</p>
                {step.action && (
                  <button
                    type="button"
                    onClick={step.action}
                    disabled={uploading}
                    className="mt-2.5 text-xs font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-300 underline disabled:opacity-50"
                  >
                    {step.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {uploadError && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-4 animate-fade-up">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Upload failed</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{uploadError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6">
        <section className="surface-strong rounded-2xl border border-edge shadow-sm p-5 sm:p-6 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-ink text-surface flex items-center justify-center">
                <FolderOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl text-ink">Recent Quote Activity</h2>
                <p className="text-xs text-ink-muted">Track your latest generated quotes.</p>
              </div>
            </div>

            <Link to="/quotes" className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink">
              All quotes
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {quotesLoading ? (
            <SkeletonList rows={4} />
          ) : quotesError ? (
            // A load failure is not the same as "no quotes" — showing the
            // empty state here would look like the account's data disappeared.
            <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-8 text-center">
              <p className="text-red-800 dark:text-red-300 font-medium">Couldn't load recent quotes</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{quotesError}</p>
              <Button variant="danger" className="mt-4"
                onClick={loadRecentQuotes}
              >
                Retry
              </Button>
            </div>
          ) : quotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-edge-strong bg-surface-muted p-8 text-center">
              <p className="text-ink-secondary font-medium">No quotes yet.</p>
              <p className="text-sm text-ink-muted mt-1">Upload your first file to start building estimates.</p>
              <button
                type="button"
                onClick={() => onDrop([createSamplePartFile()])}
                disabled={uploading}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ink text-surface text-sm font-semibold hover:bg-ink/85 transition-colors disabled:opacity-50"
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
                    className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface px-3 py-3 transition hover:border-edge-strong hover:shadow-sm"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PartThumbnail fileId={quote.cad_file_id} className="w-8 h-8" />
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{quote.quote_number}</p>
                        <p className="text-xs text-ink-muted">{new Date(quote.created_at).toLocaleDateString('en-IN')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 ml-3 shrink-0">
                      <StatusPill status={quote.status} />
                      <span className="text-sm font-semibold font-mono text-ink-secondary">{formatCurrency(quote.total_price)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="surface-strong rounded-2xl border border-edge shadow-sm p-5 sm:p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-ink text-surface flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xl text-ink">Quoted Value</h2>
                  <p className="text-xs text-ink-muted">Last 8 weeks · {sentCount} sent{winRate !== null ? ` · ${winRate}% win rate` : ''}</p>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <QuoteTrendChart buckets={weeklyBuckets} />
            </div>
          </section>

          <section className="surface-strong rounded-2xl border border-edge shadow-sm p-5 sm:p-6 animate-fade-up">
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${recentResponses[0]?.status === 'accepted' ? 'bg-emerald-600' : 'bg-ink'}`}>
                <Inbox className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xl text-ink">Customer Responses</h2>
                <p className="text-xs text-ink-muted">Quotes your customers accepted or declined via the share link.</p>
              </div>
            </div>

            {recentResponses.length === 0 ? (
              <p className="rounded-xl border border-dashed border-edge-strong bg-surface-muted px-4 py-5 text-center text-sm text-ink-muted">
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
                        className={`block rounded-xl border px-3 py-2.5 hover:shadow-sm transition ${
                          accepted
                            ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-500/30'
                            : 'border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10 hover:border-red-300 dark:hover:border-red-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-ink truncate text-sm">{quote.quote_number}</p>
                            <p className="text-xs text-ink-muted truncate">
                              {quote.customer_name || 'No customer'} · {formatCurrency(quote.total_price)}
                            </p>
                          </div>
                          <span
                            className={`ml-3 shrink-0 rounded-full border bg-surface px-2 py-0.5 text-[11px] font-semibold ${
                              accepted ? 'border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-300'
                            }`}
                          >
                            {accepted ? 'Accepted' : 'Declined'}
                            {quote.responded_at ? ` · ${new Date(quote.responded_at).toLocaleDateString('en-IN')}` : ''}
                          </span>
                        </div>
                        {quote.customer_response_note && (
                          <p className="mt-1.5 text-xs text-ink-secondary italic truncate">“{quote.customer_response_note}”</p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="surface-strong rounded-2xl border border-edge shadow-sm p-5 sm:p-6 animate-fade-up">
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${expiringSoon > 0 ? 'bg-amber-500 text-white' : 'bg-ink text-surface'}`}>
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xl text-ink">Expiring Soon</h2>
                <p className="text-xs text-ink-muted">Open quotes lapsing within 7 days — worth a follow-up.</p>
              </div>
            </div>

            {expiringQuotes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-edge-strong bg-surface-muted px-4 py-5 text-center text-sm text-ink-muted">
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
                        className="flex items-center justify-between rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2.5 hover:border-amber-300 dark:hover:border-amber-500/30 hover:shadow-sm transition"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-ink truncate text-sm">{quote.quote_number}</p>
                          <p className="text-xs text-ink-muted truncate">
                            {quote.customer_name || 'No customer'} · {formatCurrency(quote.total_price)}
                          </p>
                        </div>
                        <span className="ml-3 shrink-0 rounded-full border border-amber-300 dark:border-amber-500/30 bg-surface px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="surface-strong rounded-2xl border border-edge shadow-sm p-5 sm:p-6 animate-fade-up">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl text-ink">Pricing Control Center</h2>
                <p className="text-xs text-ink-muted mt-1">Tune material rates, finish fees, and machine pricing in one place.</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-ink text-surface flex items-center justify-center shrink-0">
                <Settings className="w-4 h-4" />
              </div>
            </div>

            <Link
              to="/admin/pricing"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ink text-surface text-sm font-semibold hover:bg-ink/85 transition-colors"
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
