import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate, Link } from 'react-router-dom';
import {
  Cloud, Upload, FolderOpen, BarChart2, Clock, FileText,
  ChevronRight, Settings, Loader2, AlertCircle,
} from 'lucide-react';
import type { GeometryAnalysis, QuoteListItem } from '@/types';
import { uploadCADFile, getGeometryAnalysis, getCADFile, listQuotes } from '@/services/api';

/* ────────────────────────────────────────────────
   HomePage – Dashnode-style dashboard
──────────────────────────────────────────────── */
const HomePage = () => {
  const navigate = useNavigate();

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Recent quotes for "Recent uploads" widget
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);

  useEffect(() => {
    listQuotes(0, 5)
      .then(setQuotes)
      .catch(() => {})
      .finally(() => setQuotesLoading(false));
  }, []);

  const pollForGeometry = async (fileId: string): Promise<GeometryAnalysis> => {
    for (let i = 0; i < 30; i++) {
      try {
        return await getGeometryAnalysis(fileId);
      } catch {
        const f = await getCADFile(fileId);
        if (f.processing_status === 'failed') throw new Error(f.processing_error || 'Processing failed');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error('Processing timeout. Please try again.');
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const uploadResult = await uploadCADFile(file);
      const geometry = await pollForGeometry(uploadResult.id);
      const updatedFile = await getCADFile(uploadResult.id);
      navigate('/quote', {
        state: { multiFiles: [{ cadFile: updatedFile, geometry }] },
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  }, [navigate]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'model/step': ['.step', '.stp'],
      'model/stl': ['.stl'],
      'application/octet-stream': ['.step', '.stp', '.stl'],
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024,
    disabled: uploading,
    noClick: true,
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

  // Stats derived from quotes
  const totalParts = quotes.length;
  const mostActiveWeek = quotes.length
    ? (() => {
        const d = new Date(quotes[0].created_at);
        const end = d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const start = new Date(d.getTime() - 6 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `${start} — ${end}`;
      })()
    : '—';

  return (
    <div className="min-h-full p-6 lg:p-8">

      {/* ── 2-column grid: main | right sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 max-w-[1200px]">

        {/* ════════════ LEFT / CENTER ════════════ */}
        <div className="space-y-6">

          {/* Welcome */}
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Welcome back, Bhargava&nbsp;👋
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload a STEP file to get cost, time, and DFM insights instantly.
            </p>
          </div>

          {/* Upload zone */}
          <div
            {...getRootProps()}
            className={`relative rounded-2xl border-2 border-dashed transition-colors cursor-default ${
              isDragActive
                ? 'border-primary-400 bg-primary-50'
                : uploading
                ? 'border-gray-200 bg-gray-50'
                : 'border-primary-200 bg-blue-50/50 hover:border-primary-300'
            }`}
            style={{ minHeight: 260 }}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center h-full py-14 gap-4 text-center px-6">
              {uploading ? (
                <>
                  <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
                  <p className="text-gray-600 font-medium">Analysing geometry…</p>
                  <p className="text-sm text-gray-400">This may take a few seconds</p>
                </>
              ) : (
                <>
                  <div className="relative">
                    <Cloud className="w-14 h-14 text-primary-400" />
                    <Upload className="w-5 h-5 text-primary-600 absolute bottom-0 right-0" />
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium">
                      {isDragActive ? 'Drop to upload' : <><strong>Drag and drop</strong> files to upload, or</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={open}
                    className="px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Upload new file
                  </button>
                  <p className="text-xs text-gray-400">
                    Supports STEP &amp; STP files under 100 MB.{' '}
                    <span className="text-primary-500">Your data is always secure</span>
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Upload error */}
          {uploadError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Upload failed</p>
                <p className="text-xs text-red-600 mt-0.5">{uploadError}</p>
              </div>
            </div>
          )}

          {/* ── Bottom 2 cards ── */}
          <div className="grid sm:grid-cols-2 gap-4">

            {/* Recent uploads */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-blue-500" />
                </div>
                <h2 className="font-semibold text-gray-900">Recent uploads</h2>
              </div>

              {quotesLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                </div>
              ) : quotes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Once you upload your first file, you'll see all your projects and insights here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {quotes.slice(0, 4).map((q) => (
                    <li key={q.id}>
                      <Link
                        to={`/quotes/${q.id}`}
                        className="flex items-center justify-between py-1.5 group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-gray-300 shrink-0" />
                          <span className="text-sm text-gray-700 truncate group-hover:text-primary-600 transition-colors">
                            {q.quote_number}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0 ml-2">
                          {formatCurrency(q.total_price)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {quotes.length > 0 && (
                <Link
                  to="/quotes"
                  className="mt-3 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  View all <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {/* Manage Projects */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center">
                <BarChart2 className="w-10 h-10 text-blue-400" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Manage Projects</h2>
                <p className="text-sm text-gray-400">Add items to a project and customise their configurations.</p>
              </div>
              <Link
                to="/quotes"
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
              >
                View Quotes
              </Link>
            </div>
          </div>
        </div>

        {/* ════════════ RIGHT SIDEBAR ════════════ */}
        <div className="space-y-4">

          {/* Stats card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 text-sm">Files uploaded this</h2>
              <span className="text-xs font-medium bg-primary-50 text-primary-600 px-2.5 py-1 rounded-lg">
                Month ↓
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Total parts */}
              <div className="p-3 rounded-xl bg-blue-50">
                <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-[11px] text-gray-500">Total Parts Uploaded</p>
                <p className="text-lg font-bold text-gray-900">{totalParts}</p>
              </div>

              {/* Most active week */}
              <div className="p-3 rounded-xl bg-amber-50">
                <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center mb-2">
                  <BarChart2 className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-[11px] text-gray-500">Most Active Week</p>
                <p className="text-xs font-semibold text-gray-900 leading-tight mt-1">{mostActiveWeek}</p>
              </div>

              {/* Time saved */}
              <div className="p-3 rounded-xl bg-green-50">
                <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4 text-green-500" />
                </div>
                <p className="text-[11px] text-gray-500">Time Saved</p>
                <p className="text-lg font-bold text-gray-900">
                  {totalParts > 0 ? `${(totalParts * 0.48).toFixed(2)} hrs` : '—'}
                </p>
              </div>

              {/* Avg costing time */}
              <div className="p-3 rounded-xl bg-purple-50">
                <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center mb-2">
                  <BarChart2 className="w-4 h-4 text-purple-500" />
                </div>
                <p className="text-[11px] text-gray-500">Avg. Costing Time</p>
                <p className="text-lg font-bold text-gray-900">
                  {totalParts > 0 ? '~8 sec' : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Costing preferences */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 text-sm mb-1">
              Set up your costing preferences
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Customise machine rates, material pricing, and surface-finish costs to streamline your costing workflow.
            </p>
            <Link
              to="/admin/pricing"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Go to Cost Master
              <ChevronRight className="w-4 h-4" />
            </Link>

            {/* Decorative mini-chart */}
            <div className="mt-4 rounded-xl bg-emerald-50 p-4 flex items-end gap-1 justify-center h-24">
              {[40, 60, 45, 80, 55, 90, 70].map((h, i) => (
                <div
                  key={i}
                  className="w-4 rounded-t-md bg-emerald-300 opacity-70"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default HomePage;
