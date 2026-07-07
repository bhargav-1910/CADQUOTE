import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate, Link } from 'react-router-dom';
import {
  Cloud, Upload, FolderOpen, FileText,
  ChevronRight, Settings, Loader2, AlertCircle, ShieldCheck, Sparkles,
} from 'lucide-react';
import type { QuoteListItem } from '@/types';
import { listQuotes } from '@/services/api';
import { uploadAndProcessCADFile } from '@/services/uploadWorkflow';

const HomePage = () => {
  const navigate = useNavigate();

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
  const expiringSoon = quotes.filter((quote) => {
    const validUntil = new Date(quote.valid_until).getTime();
    return quote.status !== 'expired' && validUntil > now && validUntil - now < 3 * 86400000;
  }).length;
  const expiredCount = quotes.filter(
    (quote) => quote.status === 'expired' || new Date(quote.valid_until).getTime() < now,
  ).length;

  const statusPill = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'expired':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'generated':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

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
              <div className={`rounded-2xl border p-3 ${expiringSoon > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <p className={`text-[11px] ${expiringSoon > 0 ? 'text-amber-700' : 'text-slate-500'}`}>Expiring in 3 days</p>
                <p className="font-display text-2xl text-slate-900">{expiringSoon}</p>
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
                </div>

                <p className="text-xs text-slate-500">Single and multi-file uploads both open the same quote builder flow.</p>
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
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize border ${statusPill(quote.status)}`}>
                        {quote.status}
                      </span>
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-slate-900">Operations Snapshot</h2>
              <span className="text-xs font-medium bg-slate-900 text-white px-2.5 py-1 rounded-lg">This Month</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
                <p className="text-[11px] text-sky-700">Total Quotes</p>
                <p className="font-display text-2xl text-slate-900">{totalParts}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-[11px] text-emerald-700">Sent</p>
                <p className="font-display text-2xl text-slate-900">{sentCount}</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                <p className="text-[11px] text-amber-700">Expiring Soon</p>
                <p className="font-display text-2xl text-slate-900">{expiringSoon}</p>
              </div>
              <div className="rounded-xl bg-orange-50 border border-orange-100 p-3">
                <p className="text-[11px] text-orange-700">Expired</p>
                <p className="font-display text-2xl text-slate-900">{expiredCount}</p>
              </div>
            </div>
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

            <div className="mt-5 rounded-2xl bg-gradient-to-r from-emerald-100 to-sky-100 p-4 flex items-end gap-1 justify-center h-24">
              {[42, 58, 39, 73, 51, 86, 64].map((height, idx) => (
                <div
                  key={idx}
                  className="w-4 rounded-t-md bg-slate-700/70"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
