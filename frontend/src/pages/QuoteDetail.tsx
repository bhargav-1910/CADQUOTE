import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronRight, Copy, ExternalLink, FileText, Loader2,
  AlertCircle, CheckCircle, Package, Clock, User, Pencil, Eye,
  Link2, Check, XCircle,
} from 'lucide-react';
import type { Quote } from '@/types';
import { getQuote, generateQuotePDF, downloadQuotePDF, fetchQuotePDFPreviewBlob, shareQuote, respondToQuote, recordQuoteActuals } from '@/services/api';
import { Button, InfoTip, Input, SkeletonPage, Textarea, buttonClasses } from '@/components/ui';
import { PriceExplainer } from '@/components/PriceExplainer';
import { GLOSSARY } from '@/content/glossary';
import { ExtendValidity, QuoteDrawings, QuoteName, VersionHistory } from '@/components/QuoteWorkflowPanels';
import Breadcrumbs from '@/components/Breadcrumbs';

interface CombinedFileLine {
  fileName: string;
  quantity: number;
  totalPrice: number;
}

const parseCombinedNotes = (rawNotes: string | null): { files: CombinedFileLine[]; cleanNotes: string | null } => {
  if (!rawNotes) {
    return { files: [], cleanNotes: null };
  }

  const startTag = '[COMBINED_FILES]';
  const endTag = '[/COMBINED_FILES]';
  const start = rawNotes.indexOf(startTag);
  const end = rawNotes.indexOf(endTag);

  if (start === -1 || end === -1 || end <= start) {
    return { files: [], cleanNotes: rawNotes };
  }

  const metadataBlock = rawNotes
    .slice(start + startTag.length, end)
    .trim();

  const files: CombinedFileLine[] = metadataBlock
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|');

      // v2: cad_file_id|filename|qty|line_total|...
      // v1: filename|qty|line_total
      const hasV2Shape = parts.length >= 4;
      const fileName = hasV2Shape ? parts[1] : parts[0];
      const qtyRaw = hasV2Shape ? parts[2] : parts[1];
      const totalRaw = hasV2Shape ? parts[3] : parts[2];

      return {
        fileName: fileName ?? 'Unknown file',
        quantity: Number(qtyRaw ?? 1),
        totalPrice: Number(totalRaw ?? 0),
      };
    })
    .filter((line) => Number.isFinite(line.quantity) && Number.isFinite(line.totalPrice));

  const cleanNotes = `${rawNotes.slice(0, start)}${rawNotes.slice(end + endTag.length)}`.trim();
  return {
    files,
    cleanNotes: cleanNotes || null,
  };
};

const QuoteDetail = () => {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [marking, setMarking] = useState<'accept' | 'decline' | null>(null);
  const [markNote, setMarkNote] = useState('');
  const [markSaving, setMarkSaving] = useState(false);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!quoteId) return;

      setLoading(true);
      setQuote(null);
      setLoadError(null);
      setActionError(null);
      setPreviewVisible(false);
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      setHasPreviewed(false);
      
      try {
        const data = await getQuote(quoteId);
        setQuote(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load quote');
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [quoteId]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleDownloadPDF = async () => {
    if (!quote) return;
    if (!hasPreviewed) {
      setActionError('Please preview the quote before downloading.');
      return;
    }

    setActionError(null);
    setGenerating(true);
    try {
      if (!quote.pdf_path) {
        await generateQuotePDF(quote.id);
      }

      await downloadQuotePDF(quote.id, quote.quote_number);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  const copyShareLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      setActionError('Could not copy the link — copy it from the box below.');
    }
  };

  const handleShareQuote = async () => {
    if (!quote) return;

    setActionError(null);
    setSharing(true);
    try {
      const { share_token: shareToken } = await shareQuote(quote.id);
      setQuote((prev) =>
        prev
          ? {
              ...prev,
              share_token: shareToken,
              status: prev.status === 'draft' || prev.status === 'generated' ? 'sent' : prev.status,
            }
          : prev,
      );
      await copyShareLink(`${window.location.origin}/q/${shareToken}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setSharing(false);
    }
  };

  const handleMarkResponse = async () => {
    if (!quote || !marking) return;

    setActionError(null);
    setMarkSaving(true);
    try {
      const updated = await respondToQuote(quote.id, marking, markNote.trim() || undefined);
      setQuote(updated);
      setMarking(null);
      setMarkNote('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to record the response');
    } finally {
      setMarkSaving(false);
    }
  };

  const handlePreviewQuote = async () => {
    if (!quote) return;

    setActionError(null);
    setPreviewLoading(true);
    try {
      await generateQuotePDF(quote.id);
      const previewBlob = await fetchQuotePDFPreviewBlob(quote.id);
      const objectUrl = URL.createObjectURL(previewBlob);
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
        return objectUrl;
      });
      setPreviewVisible(true);
      setHasPreviewed(true);
      requestAnimationFrame(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to preview quote');
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <SkeletonPage />
    );
  }

  if (loadError || !quote) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-red-800 dark:text-red-300">Error Loading Quote</h2>
            <p className="text-red-600 dark:text-red-400 mt-1">{loadError || 'Quote not found'}</p>
            <Link
              to="/quotes"
              className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back to Quotes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isExpired = quote.status === 'expired' || new Date(quote.valid_until) < new Date();
  const combinedQuote = parseCombinedNotes(quote.notes);

  const hasResponse = quote.status === 'accepted' || quote.status === 'declined';
  const isShared = Boolean(quote.share_token) || quote.status === 'sent' || hasResponse;
  const shareUrl = quote.share_token ? `${window.location.origin}/q/${quote.share_token}` : null;
  // An older version is read-only history; edits and sharing happen on the latest.
  const isSuperseded = Boolean(quote.superseded_at);

  // Lifecycle: created -> generated -> shared -> customer response -> valid/expired
  const lifecycleSteps = [
    { key: 'created', label: 'Created', detail: formatDate(quote.created_at), done: true },
    { key: 'generated', label: 'Generated', detail: 'Priced & saved', done: true },
    {
      key: 'shared',
      label: 'Shared',
      detail: isShared
        ? quote.share_token
          ? 'Customer link created'
          : 'Delivered outside the app'
        : 'Not shared yet',
      done: isShared,
    },
    {
      key: 'response',
      label: quote.status === 'accepted' ? 'Accepted' : quote.status === 'declined' ? 'Declined' : 'Response',
      detail: hasResponse
        ? quote.responded_at
          ? formatDate(quote.responded_at)
          : 'Customer responded'
        : isShared
        ? 'Awaiting customer'
        : 'After sharing',
      done: quote.status === 'accepted',
      danger: quote.status === 'declined',
    },
    {
      key: 'validity',
      label: isExpired ? 'Expired' : 'Valid',
      detail: `${isExpired ? 'Expired on' : 'Until'} ${formatDate(quote.valid_until)}`,
      done: !isExpired,
      danger: isExpired,
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <Breadcrumbs items={[{ label: 'Quotes', to: '/quotes' }, { label: quote.title || quote.quote_number }]} />

      {/* Header: actions wrap under the title on narrow screens. */}
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="min-w-0">
          <QuoteName quote={quote} onRenamed={setQuote} />
          <p className="text-ink-muted text-sm mt-0.5">Created {formatDate(quote.created_at)}</p>
        </div>
        
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {!isSuperseded && (
            <Link
              to={`/quotes/${quote.id}/edit`}
              className={buttonClasses('secondary', 'md')}
              title="Saving creates the next version"
            >
              <Pencil className="w-4 h-4" />
              Edit (new version)
            </Link>
          )}
          {!isSuperseded && (
          <Button
            onClick={shareUrl ? () => copyShareLink(shareUrl) : handleShareQuote}
            disabled={sharing}
          >
            {sharing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : shareCopied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {shareCopied ? 'Link copied' : shareUrl ? 'Copy customer link' : 'Share with customer'}
          </Button>
          )}
        </div>
      </div>

      {isSuperseded && (
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-500/30 dark:bg-primary-500/10 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-primary-800 dark:text-primary-300">
            You're viewing <strong>v{quote.version}</strong>, an older version kept for reference. The customer's link shows the latest version; open it from <strong>Versions</strong> below.
          </p>
        </div>
      )}

      {/* Lifecycle timeline */}
      <div className="bg-surface rounded-xl border border-edge px-5 py-4">
        <div className="flex items-center">
          {lifecycleSteps.map((step, index) => (
            <div key={step.key} className={`flex items-center ${index < lifecycleSteps.length - 1 ? 'flex-1' : ''}`}>
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                    step.danger
                      ? 'bg-red-50 dark:bg-red-500/10 border-red-400 text-red-600 dark:text-red-400'
                      : step.done
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'bg-surface-muted border-edge-strong text-ink-subtle'
                  }`}
                >
                  {step.danger ? (
                    <Clock className="w-3.5 h-3.5" />
                  ) : step.done ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  )}
                </span>
                <div className="hidden sm:block">
                  <p className={`text-xs font-semibold ${step.danger ? 'text-red-700 dark:text-red-300' : step.done ? 'text-ink' : 'text-ink-subtle'}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-ink-subtle">{step.detail}</p>
                </div>
              </div>
              {index < lifecycleSteps.length - 1 && (
                <div className={`flex-1 h-px mx-3 ${step.done ? 'bg-emerald-300' : 'bg-fill'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Validity warning + re-quote action */}
      {isExpired && !isSuperseded && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-800 dark:text-amber-300 font-medium">Quote Expired</p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                This quote expired on {formatDate(quote.valid_until)}. Material and machine rates may have moved — re-quote to get current pricing.
              </p>
            </div>
          </div>
          <Link
            to={`/quotes/${quote.id}/edit`}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
          >
            Re-quote at current prices
          </Link>
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{actionError}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer info */}
          <div className="bg-surface rounded-xl border border-edge p-6">
            <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-ink-subtle" />
              Customer Information
            </h2>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-ink-muted">Name</p>
                {quote.customer_id ? (
                  <Link
                    to={`/customers/${quote.customer_id}`}
                    className="font-medium text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-300 hover:underline"
                  >
                    {quote.customer_name || 'View customer'}
                  </Link>
                ) : (
                  <p className="font-medium text-ink">{quote.customer_name || 'Not specified'}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-ink-muted">Email</p>
                <p className="font-medium text-ink">
                  {quote.customer_email || 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-ink-muted">Company</p>
                <p className="font-medium text-ink">
                  {quote.customer_company || 'Not specified'}
                </p>
              </div>
            </div>
          </div>

          {/* Part details */}
          <div className="bg-surface rounded-xl border border-edge p-6">
            <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-ink-subtle" />
              {combinedQuote.files.length > 0 ? 'Uploaded Files' : 'Part Details'}
            </h2>
            
            <div className="space-y-4">
              {combinedQuote.files.length > 0 ? (
                <div className="space-y-2">
                  {combinedQuote.files.map((file) => (
                    <div key={`${file.fileName}-${file.quantity}-${file.totalPrice}`} className="bg-surface-muted rounded-lg p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{file.fileName}</p>
                        <p className="text-xs text-ink-muted">Qty {file.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold text-ink">{formatCurrency(file.totalPrice)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-surface-muted rounded-lg p-4">
                  <p className="text-sm text-ink-muted">File</p>
                  <p className="font-medium text-ink">
                    {quote.cad_file.original_filename}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">
                    {quote.cad_file.file_format.toUpperCase()} • 
                    {(quote.cad_file.file_size / 1024).toFixed(1)} KB
                  </p>
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-ink-muted">Material</p>
                  <p className="font-medium text-ink">{quote.material.name}</p>
                  <p className="text-xs text-ink-muted">{quote.material.category}</p>
                </div>
                <div>
                  <p className="text-sm text-ink-muted">Surface Finish</p>
                  <p className="font-medium text-ink">{quote.surface_finish.name}</p>
                </div>
                <div>
                  <p className="text-sm text-ink-muted">Inspection</p>
                  <p className="font-medium text-ink">{quote.inspection_level.name}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-ink-muted">Quantity</p>
                <p className="font-medium text-ink">{quote.quantity} units</p>
              </div>
            </div>
          </div>

          <QuoteDrawings quote={quote} />

          {/* Price breakdown */}
          <div className="bg-surface rounded-xl border border-edge p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">Price Breakdown</h2>
              <PriceExplainer
                numbers={{
                  material: Number(quote.material_cost),
                  machining: Number(quote.machining_cost),
                  finish: Number(quote.finish_cost),
                  inspection: Number(quote.inspection_cost),
                  subtotal: Number(quote.subtotal),
                  marginFactor: Number(quote.margin_factor),
                  unitPrice: Number(quote.unit_price),
                  quantity: quote.quantity,
                  engineTotal: Number(quote.engine_total ?? quote.total_price),
                  extras: Number(quote.total_price) - Number(quote.engine_total ?? quote.total_price),
                  total: Number(quote.total_price),
                  leadTimeDays: Number(quote.estimated_lead_time_days),
                }}
              />
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-edge">
                <span className="text-ink-secondary">Material Cost<InfoTip term="material cost">{GLOSSARY.material}</InfoTip></span>
                <span className="font-medium text-ink">
                  {formatCurrency(quote.material_cost)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-edge">
                <span className="text-ink-secondary">Machining Cost<InfoTip term="machining cost">{GLOSSARY.machining}</InfoTip></span>
                <span className="font-medium text-ink">
                  {formatCurrency(quote.machining_cost)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-edge">
                <span className="text-ink-secondary">Surface Finish<InfoTip term="surface finish">{GLOSSARY.finish}</InfoTip></span>
                <span className="font-medium text-ink">
                  {formatCurrency(quote.finish_cost)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-edge">
                <span className="text-ink-secondary">Inspection<InfoTip term="inspection">{GLOSSARY.inspection}</InfoTip></span>
                <span className="font-medium text-ink">
                  {formatCurrency(quote.inspection_cost)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-edge">
                <span className="text-ink-muted">Subtotal (per unit)<InfoTip term="subtotal">{GLOSSARY.subtotal}</InfoTip></span>
                <span className="text-ink-muted">
                  {formatCurrency(quote.subtotal)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-edge">
                <span className="text-ink-muted">
                  Margin ({((quote.margin_factor - 1) * 100).toFixed(0)}%)<InfoTip term="margin">{GLOSSARY.margin}</InfoTip>
                </span>
                <span className="text-ink-muted">
                  {formatCurrency(quote.unit_price - Number(quote.subtotal))}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-edge">
                <span className="font-medium text-ink-secondary">Unit Price<InfoTip term="unit price">{GLOSSARY.unitPrice}</InfoTip></span>
                <span className="font-semibold text-ink">
                  {formatCurrency(quote.unit_price)}
                </span>
              </div>
              {quote.quantity > 1 && (
                <div className="flex justify-between py-2 border-b border-edge">
                  <span className="font-medium text-ink-secondary">
                    × {quote.quantity} units
                  </span>
                </div>
              )}
              {quote.line_items && quote.line_items.length > 0 && (
                <>
                  {quote.engine_total !== null && (
                    <div className="flex justify-between py-2 border-b border-edge">
                      <span className="font-medium text-ink-secondary">Computed price</span>
                      <span className="font-semibold text-ink">{formatCurrency(Number(quote.engine_total))}</span>
                    </div>
                  )}
                  {quote.line_items.map((item, index) => (
                    <div key={index} className="flex justify-between gap-3 py-2 border-b border-edge">
                      <span className={item.kind === 'note' ? 'italic text-ink-muted' : 'text-ink-secondary'}>
                        {item.kind === 'discount' ? 'Discount: ' : item.kind === 'charge' ? '' : 'Note: '}
                        {item.label}
                      </span>
                      {item.kind !== 'note' && (
                        <span className={`whitespace-nowrap font-medium ${item.kind === 'discount' ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink'}`}>
                          {item.kind === 'discount' ? '−' : '+'}{formatCurrency(Number(item.amount))}
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-between py-3 bg-primary-50 dark:bg-primary-500/10 -mx-6 px-6 rounded-lg">
                <span className="font-semibold text-primary-900 dark:text-primary-300 text-lg">Total</span>
                <span className="font-bold text-primary-900 dark:text-primary-300 text-lg">
                  {formatCurrency(quote.total_price)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {combinedQuote.cleanNotes && (
            <div className="bg-surface rounded-xl border border-edge p-6">
              <h2 className="text-lg font-semibold text-ink mb-4">Notes</h2>
              <p className="text-ink-secondary whitespace-pre-wrap">{combinedQuote.cleanNotes}</p>
            </div>
          )}

          {previewVisible && previewUrl && (
            <div ref={previewSectionRef} className="bg-surface rounded-xl border border-edge p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-ink">Quote Preview</h2>
                <button
                  type="button"
                  onClick={() => setPreviewVisible(false)}
                  className="text-sm text-ink-secondary hover:text-ink"
                >
                  Hide Preview
                </button>
              </div>
              <iframe
                title="Quote PDF Preview"
                src={previewUrl}
                className="w-full h-[70vh] rounded-lg border border-edge"
              />
            </div>
          )}

          <ActualCostingCard quote={quote} onSaved={setQuote} />

          <div className="bg-surface rounded-xl border border-edge p-6">
            <h2 className="text-lg font-semibold text-ink mb-4">RFQ and Commercial Terms</h2>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div><p className="text-ink-muted">RFQ Number</p><p className="font-medium text-ink">{quote.rfq_number || 'Not specified'}</p></div>
              <div><p className="text-ink-muted">RFQ Date</p><p className="font-medium text-ink">{quote.rfq_date ? formatDate(quote.rfq_date) : 'Not specified'}</p></div>
              <div><p className="text-ink-muted">Quote Due Date</p><p className="font-medium text-ink">{quote.quote_due_date ? formatDate(quote.quote_due_date) : 'Not specified'}</p></div>
              <div><p className="text-ink-muted">HSN Code</p><p className="font-medium text-ink">{quote.hsn_code || 'Not specified'}</p></div>
              <div className="sm:col-span-2"><p className="text-ink-muted">Tolerance Notes (Part-wise)</p><p className="font-medium text-ink whitespace-pre-wrap">{quote.tolerance_notes || 'Not specified'}</p></div>
              <div><p className="text-ink-muted">Payment Terms</p><p className="font-medium text-ink">{quote.payment_terms || 'Not specified'}</p></div>
              <div><p className="text-ink-muted">Delivery</p><p className="font-medium text-ink">{quote.delivery || 'Not specified'}</p></div>
              <div><p className="text-ink-muted">GST</p><p className="font-medium text-ink">{quote.gst || 'Not specified'}</p></div>
              <div><p className="text-ink-muted">Price Validity</p><p className="font-medium text-ink">{quote.price_validity || 'Not specified'}</p></div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Summary card */}
          <div className="bg-primary-600 rounded-xl p-6 text-white">
            <p className="text-primary-100 text-sm">Total Price</p>
            <p className="text-3xl font-bold mb-4">
              {formatCurrency(quote.total_price)}
            </p>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-primary-200" />
                <span>
                  {combinedQuote.files.length > 0
                    ? `${combinedQuote.files.length} file${combinedQuote.files.length === 1 ? '' : 's'}`
                    : `${quote.quantity} unit${quote.quantity > 1 ? 's' : ''}`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-primary-200" />
                <span>{quote.estimated_lead_time_days} days lead time</span>
              </div>
            </div>
          </div>

          {/* Validity */}
          <div className={`rounded-xl p-6 ${
            isExpired ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30' : 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {isExpired ? (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              ) : (
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className={`font-semibold ${isExpired ? 'text-red-800 dark:text-red-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
                {isExpired ? 'Expired' : 'Valid Quote'}
              </span>
            </div>
            <p className={`text-sm ${isExpired ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {isExpired ? 'Expired on' : 'Valid until'} {formatDate(quote.valid_until)}
            </p>
            <ExtendValidity quote={quote} onExtended={setQuote} />
          </div>

          <VersionHistory quote={quote} />

          {/* Customer link & response */}
          <div className="bg-surface rounded-xl border border-edge p-6 space-y-4">
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Link2 className="w-4 h-4 text-ink-subtle" />
              Customer Link
            </h2>

            {shareUrl ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 font-mono"
                    aria-label="Customer quote link"
                  />
                  <button
                    onClick={() => copyShareLink(shareUrl)}
                    title="Copy link"
                    className="shrink-0 rounded-lg border border-edge p-2 text-ink-secondary hover:bg-surface-muted transition-colors"
                  >
                    {shareCopied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open customer view"
                    className="shrink-0 rounded-lg border border-edge p-2 text-ink-secondary hover:bg-surface-muted transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-xs text-ink-muted">
                  Anyone with this link can view the quote, download the PDF, and accept or decline it.
                </p>
                <p className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                  <Eye className="h-3.5 w-3.5" />
                  {quote.customer_viewed_at
                    ? `Customer last opened it ${new Date(quote.customer_viewed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                    : 'Not opened by the customer yet'}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-secondary">
                  Create a link your customer can open to view this quote and respond to it.
                </p>
                <Button size="lg" className="w-full"
                  onClick={handleShareQuote}
                  disabled={sharing}
                >
                  {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  {sharing ? 'Creating link...' : 'Create customer link'}
                </Button>
              </>
            )}

            {quote.status === 'accepted' ? (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle className="w-4 h-4" />
                  Accepted by customer
                </p>
                {quote.responded_at && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">{formatDate(quote.responded_at)}</p>
                )}
                {quote.customer_response_note && (
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-2 whitespace-pre-wrap">
                    “{quote.customer_response_note}”
                  </p>
                )}
              </div>
            ) : quote.status === 'declined' ? (
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800 dark:text-red-300">
                  <XCircle className="w-4 h-4" />
                  Declined by customer
                </p>
                {quote.responded_at && (
                  <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{formatDate(quote.responded_at)}</p>
                )}
                {quote.customer_response_note && (
                  <p className="text-xs text-red-800 dark:text-red-300 mt-2 whitespace-pre-wrap">
                    “{quote.customer_response_note}”
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-surface-muted border border-edge p-3 space-y-2.5">
                {shareUrl && (
                  <div>
                    <p className="text-sm font-medium text-ink-secondary">Awaiting customer response</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Their decision will appear here once they respond.
                    </p>
                  </div>
                )}

                {marking ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-ink">
                      Mark this quote as {marking === 'accept' ? 'accepted' : 'declined'}?
                    </p>
                    <Textarea
                      value={markNote}
                      onChange={(e) => setMarkNote(e.target.value)}
                      rows={2}
                      placeholder="Optional note — e.g. “Confirmed on phone, PO to follow”" className="w-full"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleMarkResponse}
                        disabled={markSaving}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                          marking === 'accept' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {markSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : marking === 'accept' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Confirm {marking === 'accept' ? 'accepted' : 'declined'}
                      </button>
                      <Button variant="secondary"
                        onClick={() => {
                          setMarking(null);
                          setMarkNote('');
                        }}
                        disabled={markSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-ink-muted">
                      Sent the PDF yourself? Record the customer's decision here.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => setMarking('accept')}
                        className="flex-1 whitespace-nowrap flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Mark as accepted
                      </button>
                      <Button variant="secondary" className="flex-1"
                        onClick={() => setMarking('decline')}
                      >
                        <XCircle className="w-4 h-4" />
                        Declined
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-surface rounded-xl border border-edge p-6 space-y-3">
            <button
              onClick={handlePreviewQuote}
              disabled={previewLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-primary-300 dark:border-primary-500/30 text-primary-700 dark:text-primary-300 font-medium rounded-lg hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors disabled:opacity-50"
            >
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {previewLoading ? 'Loading Preview...' : 'Preview Quote'}
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-ink text-surface font-medium rounded-lg hover:bg-ink/85 transition-colors disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Download PDF Quote
            </button>
            {!hasPreviewed && (
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-2">
                Preview is required before download.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ACTUAL_FIELDS: { key: string; label: string }[] = [
  { key: 'number_of_setups', label: 'Setups' },
  { key: 'fixturing_hours', label: 'Fixturing (hrs)' },
  { key: 'cam_time_hours', label: 'CAM (hrs)' },
  { key: 'machining_time_min', label: 'Machining (min)' },
  { key: 'material_cost', label: 'Material (₹)' },
  { key: 'tooling_cost', label: 'Tooling (₹)' },
  { key: 'nre_cost', label: 'NRE (₹)' },
  { key: 'final_price', label: 'Final price (₹)' },
];

/**
 * Calibration loop: record what the job actually took next to what the
 * engine predicted. Every saved correction becomes a data point the pricing
 * coefficients get tuned against.
 */
const ActualCostingCard = ({ quote, onSaved }: { quote: Quote; onSaved: (q: Quote) => void }) => {
  const predicted = (quote.predicted_costing ?? {}) as Record<string, unknown>;
  const actual = (quote.actual_costing ?? {}) as Record<string, unknown>;
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = (v: unknown) =>
    typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : null;

  const handleSave = async () => {
    const payload: Record<string, number | string> = {};
    for (const [key, raw] of Object.entries(values)) {
      const trimmed = raw.trim();
      if (trimmed !== '' && Number.isFinite(Number(trimmed))) payload[key] = Number(trimmed);
    }
    if (notes.trim()) payload.notes = notes.trim();
    if (Object.keys(payload).length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await recordQuoteActuals(quote.id, payload);
      onSaved(updated);
      setValues({});
      setNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save actuals');
    } finally {
      setSaving(false);
    }
  };

  const hasInput = Object.values(values).some((v) => v.trim() !== '') || notes.trim() !== '';

  return (
    <div className="bg-surface rounded-xl border border-edge p-6">
      <h2 className="text-lg font-semibold text-ink mb-1">Actual Costing (Calibration)</h2>
      <p className="text-sm text-ink-muted mb-4">
        Record what the job really took — corrections are compared against the engine's
        prediction to improve future quotes.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ACTUAL_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs text-ink-muted mb-1">{label}</label>
            <Input
              type="number"
              min="0"
              value={values[key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={fmt(predicted[key]) ?? '—'} className="w-full"
            />
            <p className="text-[11px] text-ink-subtle mt-0.5">
              {fmt(actual[key]) != null
                ? `Recorded: ${fmt(actual[key])}`
                : fmt(predicted[key]) != null
                  ? `Predicted: ${fmt(predicted[key])}`
                  : 'No prediction'}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-3 items-start">
        <Input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (tooling issues, rework, why it differed...)" className="flex-1"
        />
        <Button size="sm"
          onClick={handleSave}
          disabled={saving || !hasInput}
        >
          {saving ? 'Saving...' : 'Save actuals'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
    </div>
  );
};

export default QuoteDetail;
