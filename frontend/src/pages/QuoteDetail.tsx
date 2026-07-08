import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronRight, Download, FileText, Mail, Loader2, Home,
  AlertCircle, CheckCircle, Package, Clock, User, Pencil, Eye,
  Link2, Check,
} from 'lucide-react';
import type { Quote } from '@/types';
import { getQuote, generateQuotePDF, downloadQuotePDF, sendQuoteEmail, fetchQuotePDFPreviewBlob, shareQuote } from '@/services/api';
import { useAuth } from '@/components/AuthProvider';
import { StatusPill } from '@/components/ui';

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
  const { user } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasPreviewed, setHasPreviewed] = useState(false);
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

  const handleShareQuote = async () => {
    if (!quote) return;

    setActionError(null);
    setSharing(true);
    try {
      const { share_token: shareToken } = await shareQuote(quote.id);
      const shareUrl = `${window.location.origin}/q/${shareToken}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setSharing(false);
    }
  };

  const handleEmailQuote = async () => {
    if (!quote || !quote.customer_email) {
      setActionError('Customer email is missing for this quote');
      return;
    }

    if (!hasPreviewed) {
      setActionError('Please preview the quote before emailing.');
      return;
    }

    const consentMessage = [
      'Allow this app to use your logged-in email identity for this one email?',
      '',
      `Logged-in email: ${user?.email || 'Unavailable'}`,
      `Recipient: ${quote.customer_email}`,
      '',
      'Note: Actual delivery is still performed by server SMTP. Your email identity is used in sender headers when provider policy allows.',
    ].join('\n');

    const permissionGranted = window.confirm(consentMessage);
    if (!permissionGranted) {
      setActionError('Email sending cancelled. Permission was not granted.');
      return;
    }

    setActionError(null);
    setEmailSuccess(null);
    setEmailing(true);

    try {
      const response = await sendQuoteEmail(quote.id, {
        recipient_email: quote.customer_email,
        mailbox_access_consent: true,
        send_as_logged_in_user: true,
      });
      setEmailSuccess(`Email sent to ${response.recipient_email}`);
      setQuote((prev) => (prev ? { ...prev, status: 'sent' } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to email quote');
    } finally {
      setEmailing(false);
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (loadError || !quote) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-red-800">Error Loading Quote</h2>
            <p className="text-red-600 mt-1">{loadError || 'Quote not found'}</p>
            <Link
              to="/quotes"
              className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-red-700 hover:text-red-800"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back to My Quotes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isExpired = quote.status === 'expired' || new Date(quote.valid_until) < new Date();
  const combinedQuote = parseCombinedNotes(quote.notes);

  // Lifecycle: created -> generated -> sent -> valid/expired
  const lifecycleSteps = [
    { key: 'created', label: 'Created', detail: formatDate(quote.created_at), done: true },
    { key: 'generated', label: 'Generated', detail: 'Priced & saved', done: true },
    {
      key: 'sent',
      label: 'Sent',
      detail: quote.status === 'sent' ? 'Emailed to customer' : 'Not sent yet',
      done: quote.status === 'sent',
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
    <div className="p-6 lg:p-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/workspace" className="flex items-center gap-1 hover:text-gray-900 transition-colors">
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/quotes" className="hover:text-gray-900 transition-colors">My Quotes</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">{quote.quote_number}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
            <StatusPill status={quote.status} />
          </div>
          <p className="text-gray-500 text-sm mt-0.5">Created {formatDate(quote.created_at)}</p>
        </div>
        
        <div className="flex gap-3">
          <Link
            to={`/quote/${quote.id}/edit`}
            className="flex items-center gap-2 px-4 py-2 border border-primary-200 text-primary-700 font-medium rounded-lg hover:bg-primary-50 transition-colors text-sm"
          >
            <Pencil className="w-4 h-4" />
            Edit in Configure
          </Link>
          <Link
            to="/quotes"
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            All Quotes
          </Link>
          <button
            onClick={handleShareQuote}
            disabled={sharing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
          >
            {sharing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : shareCopied ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {shareCopied ? 'Link copied' : 'Share with customer'}
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PDF
          </button>
        </div>
      </div>

      {/* Lifecycle timeline */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex items-center">
          {lifecycleSteps.map((step, index) => (
            <div key={step.key} className={`flex items-center ${index < lifecycleSteps.length - 1 ? 'flex-1' : ''}`}>
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                    step.danger
                      ? 'bg-red-50 border-red-400 text-red-600'
                      : step.done
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                      : 'bg-gray-50 border-gray-300 text-gray-400'
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
                  <p className={`text-xs font-semibold ${step.danger ? 'text-red-700' : step.done ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-gray-400">{step.detail}</p>
                </div>
              </div>
              {index < lifecycleSteps.length - 1 && (
                <div className={`flex-1 h-px mx-3 ${step.done ? 'bg-emerald-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Validity warning + re-quote action */}
      {isExpired && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-800 font-medium">Quote Expired</p>
              <p className="text-sm text-amber-600">
                This quote expired on {formatDate(quote.valid_until)}. Material and machine rates may have moved — re-quote to get current pricing.
              </p>
            </div>
          </div>
          <Link
            to={`/quote/${quote.id}/edit`}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
          >
            Re-quote at current prices
          </Link>
        </div>
      )}

      {emailSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">{emailSuccess}</p>
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-gray-400" />
              Customer Information
            </h2>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-medium text-gray-900">
                  {quote.customer_name || 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium text-gray-900">
                  {quote.customer_email || 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Company</p>
                <p className="font-medium text-gray-900">
                  {quote.customer_company || 'Not specified'}
                </p>
              </div>
            </div>
          </div>

          {/* Part details */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-400" />
              {combinedQuote.files.length > 0 ? 'Uploaded Files' : 'Part Details'}
            </h2>
            
            <div className="space-y-4">
              {combinedQuote.files.length > 0 ? (
                <div className="space-y-2">
                  {combinedQuote.files.map((file) => (
                    <div key={`${file.fileName}-${file.quantity}-${file.totalPrice}`} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{file.fileName}</p>
                        <p className="text-xs text-gray-500">Qty {file.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(file.totalPrice)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">File</p>
                  <p className="font-medium text-gray-900">
                    {quote.cad_file.original_filename}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {quote.cad_file.file_format.toUpperCase()} • 
                    {(quote.cad_file.file_size / 1024).toFixed(1)} KB
                  </p>
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Material</p>
                  <p className="font-medium text-gray-900">{quote.material.name}</p>
                  <p className="text-xs text-gray-500">{quote.material.category}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Surface Finish</p>
                  <p className="font-medium text-gray-900">{quote.surface_finish.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Inspection</p>
                  <p className="font-medium text-gray-900">{quote.inspection_level.name}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Quantity</p>
                <p className="font-medium text-gray-900">{quote.quantity} units</p>
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Price Breakdown
            </h2>
            
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Material Cost</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(quote.material_cost)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Machining Cost</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(quote.machining_cost)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Surface Finish</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(quote.finish_cost)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Inspection</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(quote.inspection_cost)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Subtotal (per unit)</span>
                <span className="text-gray-500">
                  {formatCurrency(quote.subtotal)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">
                  Margin ({((quote.margin_factor - 1) * 100).toFixed(0)}%)
                </span>
                <span className="text-gray-500">
                  {formatCurrency(quote.unit_price - Number(quote.subtotal))}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="font-medium text-gray-700">Unit Price</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(quote.unit_price)}
                </span>
              </div>
              {quote.quantity > 1 && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-700">
                    × {quote.quantity} units
                  </span>
                </div>
              )}
              <div className="flex justify-between py-3 bg-primary-50 -mx-6 px-6 rounded">
                <span className="font-semibold text-primary-900 text-lg">Total</span>
                <span className="font-bold text-primary-900 text-lg">
                  {formatCurrency(quote.total_price)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {combinedQuote.cleanNotes && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{combinedQuote.cleanNotes}</p>
            </div>
          )}

          {previewVisible && previewUrl && (
            <div ref={previewSectionRef} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Quote Preview</h2>
                <button
                  type="button"
                  onClick={() => setPreviewVisible(false)}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Hide Preview
                </button>
              </div>
              <iframe
                title="Quote PDF Preview"
                src={previewUrl}
                className="w-full h-[70vh] rounded-lg border border-gray-200"
              />
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">RFQ and Commercial Terms</h2>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-500">RFQ Number</p><p className="font-medium text-gray-900">{quote.rfq_number || 'Not specified'}</p></div>
              <div><p className="text-gray-500">RFQ Date</p><p className="font-medium text-gray-900">{quote.rfq_date ? formatDate(quote.rfq_date) : 'Not specified'}</p></div>
              <div><p className="text-gray-500">Quote Due Date</p><p className="font-medium text-gray-900">{quote.quote_due_date ? formatDate(quote.quote_due_date) : 'Not specified'}</p></div>
              <div><p className="text-gray-500">HSN Code</p><p className="font-medium text-gray-900">{quote.hsn_code || 'Not specified'}</p></div>
              <div className="sm:col-span-2"><p className="text-gray-500">Tolerance Notes (Part-wise)</p><p className="font-medium text-gray-900 whitespace-pre-wrap">{quote.tolerance_notes || 'Not specified'}</p></div>
              <div><p className="text-gray-500">Payment Terms</p><p className="font-medium text-gray-900">{quote.payment_terms || 'Not specified'}</p></div>
              <div><p className="text-gray-500">Delivery</p><p className="font-medium text-gray-900">{quote.delivery || 'Not specified'}</p></div>
              <div><p className="text-gray-500">GST</p><p className="font-medium text-gray-900">{quote.gst || 'Not specified'}</p></div>
              <div><p className="text-gray-500">Price Validity</p><p className="font-medium text-gray-900">{quote.price_validity || 'Not specified'}</p></div>
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
            isExpired ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {isExpired ? (
                <AlertCircle className="w-5 h-5 text-red-600" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-600" />
              )}
              <span className={`font-semibold ${isExpired ? 'text-red-800' : 'text-green-800'}`}>
                {isExpired ? 'Expired' : 'Valid Quote'}
              </span>
            </div>
            <p className={`text-sm ${isExpired ? 'text-red-600' : 'text-green-600'}`}>
              {isExpired ? 'Expired on' : 'Valid until'} {formatDate(quote.valid_until)}
            </p>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <button
              onClick={handlePreviewQuote}
              disabled={previewLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-primary-300 text-primary-700 font-medium rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50"
            >
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {previewLoading ? 'Loading Preview...' : 'Preview Quote'}
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Download PDF Quote
            </button>
            
            {quote.customer_email && (
              <button
                onClick={handleEmailQuote}
                disabled={emailing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                {emailing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {emailing ? 'Sending Email...' : 'Email Customer'}
              </button>
            )}
            {!hasPreviewed && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Preview is required before download or email.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteDetail;
