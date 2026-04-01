import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ChevronRight, Download, FileText, Mail, Loader2, Home,
  AlertCircle, CheckCircle, Package, Clock, User 
} from 'lucide-react';
import type { Quote } from '@/types';
import { getQuote, generateQuotePDF, downloadQuotePDF, sendQuoteEmail } from '@/services/api';
import { useAuth } from '@/components/AuthProvider';

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
      const [fileName, qtyRaw, totalRaw] = line.split('|');
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
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!quoteId) return;
      
      try {
        const data = await getQuote(quoteId);
        setQuote(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load quote');
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [quoteId]);

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

    setError(null);
    setGenerating(true);
    try {
      if (!quote.pdf_path) {
        await generateQuotePDF(quote.id);
      }

      await downloadQuotePDF(quote.id, quote.quote_number);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handleEmailQuote = async () => {
    if (!quote || !quote.customer_email) {
      setError('Customer email is missing for this quote');
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
      setError('Email sending cancelled. Permission was not granted.');
      return;
    }

    setError(null);
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
      setError(err instanceof Error ? err.message : 'Failed to email quote');
    } finally {
      setEmailing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-red-800">Error Loading Quote</h2>
            <p className="text-red-600 mt-1">{error || 'Quote not found'}</p>
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

  const isExpired = new Date(quote.valid_until) < new Date();
  const combinedQuote = parseCombinedNotes(quote.notes);

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
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
                quote.status === 'generated'
                  ? 'bg-green-100 text-green-700'
                  : quote.status === 'sent'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {quote.status}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">Created {formatDate(quote.created_at)}</p>
        </div>
        
        <div className="flex gap-3">
          <Link
            to="/quotes"
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            All Quotes
          </Link>
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

      {/* Validity warning */}
      {isExpired && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-800 font-medium">Quote Expired</p>
            <p className="text-sm text-amber-600">
              This quote expired on {formatDate(quote.valid_until)}. Prices may have changed.
            </p>
          </div>
        </div>
      )}

      {emailSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">{emailSuccess}</p>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteDetail;
