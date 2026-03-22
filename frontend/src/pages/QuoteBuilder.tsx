import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, CheckCircle, Package, Home, ChevronRight, Eye } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import ModelViewer from '@/components/ModelViewer';
import ConfigurationPanel from '@/components/ConfigurationPanel';
import PricingDisplay from '@/components/PricingDisplay';
import DFXAnalysis from '@/components/DFXAnalysis';
import FilePreviewModal from '@/components/FilePreviewModal';
import type { CADFile, GeometryAnalysis, PricingResponse, PricingOverrides, QuoteConfiguration } from '@/types';
import { getInstantPricing, getBatchPricing, createQuote, createBatchQuote } from '@/services/api';
import type { ProcessedCADUpload } from '@/services/uploadWorkflow';

interface MultiFileEntry {
  cadFile: CADFile;
  geometry: GeometryAnalysis;
  pricing: PricingResponse | null;
  pricingLoading: boolean;
}

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);

const getDFXSeverity = (geometry: GeometryAnalysis | null): 'error' | 'warning' | 'ok' => {
  if (!geometry) return 'ok';

  if (geometry.min_wall_thickness && geometry.min_wall_thickness < 1.5) return 'error';
  if (geometry.min_wall_thickness && geometry.min_wall_thickness < 2.0) return 'warning';
  if (geometry.complexity_score > 5) return 'warning';
  if (geometry.removal_ratio < 0.3) return 'warning';
  return 'ok';
};

const buildPricingOverridesPayload = (
  enabled: boolean,
  overrides: PricingOverrides,
): PricingOverrides | undefined => {
  if (!enabled) {
    return undefined;
  }

  const filteredEntries = Object.entries(overrides).filter(([, value]) =>
    typeof value === 'number' && Number.isFinite(value)
  );

  if (filteredEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(filteredEntries) as PricingOverrides;
};

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const initialMultiFiles: ProcessedCADUpload[] =
    location.state?.multiFiles ?? [];

  // Shared config (multi-file mode)
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [surfaceFinishId, setSurfaceFinishId] = useState<string | null>(null);
  const [inspectionLevelId, setInspectionLevelId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [notes, setNotes] = useState('');

  // Single-file state
  const [config, setConfig] = useState<QuoteConfiguration>({
    cadFile: initialMultiFiles.length === 1 ? initialMultiFiles[0].cadFile : null,
    geometry: initialMultiFiles.length === 1 ? initialMultiFiles[0].geometry : null,
    materialId: null,
    surfaceFinishId: null,
    inspectionLevelId: null,
    quantity: 1,
    customerName: '',
    customerEmail: '',
    customerCompany: '',
    notes: '',
  });
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const singlePricingRequestVersion = useRef(0);

  // Multi-file state
  const [multiFiles, setMultiFiles] = useState<MultiFileEntry[]>(
    initialMultiFiles.map((f) => ({ ...f, pricing: null, pricingLoading: false }))
  );
  const [previewFile, setPreviewFile] = useState<MultiFileEntry | null>(null);
  const isMultiMode = multiFiles.length > 1;
  const pricingRequestVersion = useRef(0);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useQuoteSpecificPricing, setUseQuoteSpecificPricing] = useState(false);
  const [pricingOverrides, setPricingOverrides] = useState<PricingOverrides>({});
  const [step, setStep] = useState<'upload' | 'configure'>(
    initialMultiFiles.length > 0 ? 'configure' : 'upload'
  );

  const pricingOverridesPayload = useMemo(
    () => buildPricingOverridesPayload(useQuoteSpecificPricing, pricingOverrides),
    [useQuoteSpecificPricing, pricingOverrides]
  );

  // Single-file pricing
  const calculateSinglePricing = useCallback(async () => {
    if (!config.cadFile || !config.materialId || !config.surfaceFinishId || !config.inspectionLevelId) return;
    const requestVersion = ++singlePricingRequestVersion.current;
    setPricingLoading(true);
    setError(null);
    try {
      const result = await getInstantPricing({
        cad_file_id: config.cadFile.id,
        material_id: config.materialId,
        surface_finish_id: config.surfaceFinishId,
        inspection_level_id: config.inspectionLevelId,
        quantity: config.quantity,
        pricing_overrides: pricingOverridesPayload,
      });
      if (singlePricingRequestVersion.current !== requestVersion) {
        return;
      }
      setPricing(result);
    } catch (err) {
      if (singlePricingRequestVersion.current !== requestVersion) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to calculate pricing');
      setPricing(null);
    } finally {
      if (singlePricingRequestVersion.current === requestVersion) {
        setPricingLoading(false);
      }
    }
  }, [
    config.cadFile,
    config.materialId,
    config.surfaceFinishId,
    config.inspectionLevelId,
    config.quantity,
    pricingOverridesPayload,
  ]);

  useEffect(() => {
    if (!isMultiMode) calculateSinglePricing();
  }, [calculateSinglePricing, isMultiMode]);

  // Multi-file pricing: recalculate all when shared config changes
  const multiFileIds = multiFiles.map((file) => file.cadFile.id).join(',');

  useEffect(() => {
    if (!isMultiMode || multiFiles.length === 0) return;

    if (!materialId || !surfaceFinishId || !inspectionLevelId) {
      setMultiFiles((prev) => prev.map((f) => ({ ...f, pricing: null, pricingLoading: false })));
      return;
    }

    let cancelled = false;
    const requestVersion = ++pricingRequestVersion.current;

    const cadFileIds = multiFiles.map((entry) => entry.cadFile.id);

    setMultiFiles((prev) => prev.map((f) => ({ ...f, pricingLoading: true, pricing: null })));

    const fetchAllPricing = async () => {
      const batchResult = await getBatchPricing({
        cad_file_ids: cadFileIds,
        material_id: materialId,
        surface_finish_id: surfaceFinishId,
        inspection_level_id: inspectionLevelId,
        quantity,
        pricing_overrides: pricingOverridesPayload,
      });

      if (cancelled || pricingRequestVersion.current !== requestVersion) {
        return;
      }

      const pricingByCadFileId = new Map<string, PricingResponse>();
      batchResult.results.forEach((item) => {
        pricingByCadFileId.set(item.cad_file_id, item);
      });

      setMultiFiles((prev) =>
        prev.map((file) => ({
          ...file,
          pricing: pricingByCadFileId.get(file.cadFile.id) ?? null,
          pricingLoading: false,
        }))
      );
    };

    fetchAllPricing().catch(() => {
      if (cancelled || pricingRequestVersion.current !== requestVersion) {
        return;
      }
      setError('Failed to calculate pricing');
      setMultiFiles((prev) => prev.map((f) => ({ ...f, pricingLoading: false })));
    });

    return () => {
      cancelled = true;
    };
  }, [
    materialId,
    surfaceFinishId,
    inspectionLevelId,
    quantity,
    isMultiMode,
    multiFileIds,
    pricingOverridesPayload,
  ]);

  const handleFilesUploaded = (files: ProcessedCADUpload[]) => {
    setError(null);
    setPricing(null);
    setUseQuoteSpecificPricing(false);
    setPricingOverrides({});

    if (files.length === 1) {
      const [file] = files;
      setConfig((prev) => ({ ...prev, cadFile: file.cadFile, geometry: file.geometry }));
      setMultiFiles([{ ...file, pricing: null, pricingLoading: false }]);
    } else {
      setConfig((prev) => ({ ...prev, cadFile: null, geometry: null }));
      setMultiFiles(files.map((file) => ({ ...file, pricing: null, pricingLoading: false })));
    }

    setStep('configure');
  };

  const handleCreateSingleQuote = async () => {
    if (!config.cadFile || !pricing) return;
    setCreating(true);
    setError(null);
    try {
      const quote = await createQuote({
        cad_file_id: config.cadFile.id,
        material_id: config.materialId!,
        surface_finish_id: config.surfaceFinishId!,
        inspection_level_id: config.inspectionLevelId!,
        quantity: config.quantity,
        pricing_overrides: pricingOverridesPayload,
        customer_name: config.customerName || undefined,
        customer_email: config.customerEmail || undefined,
        customer_company: config.customerCompany || undefined,
        notes: config.notes || undefined,
      });
      navigate(`/quotes/${quote.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quote');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBatchQuotes = async () => {
    if (!materialId || !surfaceFinishId || !inspectionLevelId) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createBatchQuote({
        cad_file_ids: multiFiles.map((f) => f.cadFile.id),
        material_id: materialId,
        surface_finish_id: surfaceFinishId,
        inspection_level_id: inspectionLevelId,
        quantity,
        pricing_overrides: pricingOverridesPayload,
        customer_name: customerName || undefined,
        customer_email: customerEmail || undefined,
        customer_company: customerCompany || undefined,
        notes: notes || undefined,
      });
      navigate('/quotes', {
        state: { batchIds: result.quotes.map((q) => q.id), batchTotal: result.total_price },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quotes');
    } finally {
      setCreating(false);
    }
  };

  const resetToUpload = () => {
    setMultiFiles([]);
    setMaterialId(null);
    setSurfaceFinishId(null);
    setInspectionLevelId(null);
    setQuantity(1);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerCompany('');
    setNotes('');
    setConfig({
      cadFile: null, geometry: null, materialId: null, surfaceFinishId: null,
      inspectionLevelId: null, quantity: 1,
      customerName: '', customerEmail: '', customerCompany: '', notes: '',
    });
    setPricing(null);
    setUseQuoteSpecificPricing(false);
    setPricingOverrides({});
    setStep('upload');
  };

  // Shared customer form fields
  const formFields = [
    {
      label: 'Name', type: 'text', placeholder: 'Customer name',
      value: isMultiMode ? customerName : config.customerName,
      onChange: (v: string) => isMultiMode ? setCustomerName(v) : setConfig((p) => ({ ...p, customerName: v })),
    },
    {
      label: 'Email', type: 'email', placeholder: 'customer@company.com',
      value: isMultiMode ? customerEmail : config.customerEmail,
      onChange: (v: string) => isMultiMode ? setCustomerEmail(v) : setConfig((p) => ({ ...p, customerEmail: v })),
    },
    {
      label: 'Company', type: 'text', placeholder: 'Company name',
      value: isMultiMode ? customerCompany : config.customerCompany,
      onChange: (v: string) => isMultiMode ? setCustomerCompany(v) : setConfig((p) => ({ ...p, customerCompany: v })),
    },
  ];

  const customerForm = (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information (Optional)</h2>
      <div className="space-y-4">
        {formFields.map(({ label, type, placeholder, value, onChange }) => (
          <div key={label}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              type={type} value={value} placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={isMultiMode ? notes : config.notes}
            onChange={(e) => isMultiMode ? setNotes(e.target.value) : setConfig((p) => ({ ...p, notes: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Any special requirements or notes..."
          />
        </div>
      </div>
    </div>
  );

  const multiTotal = multiFiles.reduce((sum, f) => sum + Number(f.pricing?.price_breakdown.total_price ?? 0), 0);
  const pricedFileCount = multiFiles.filter((f) => f.pricing !== null).length;
  const pendingFileCount = Math.max(multiFiles.length - pricedFileCount, 0);
  const allMultiPriced = multiFiles.length > 0 && multiFiles.every((f) => f.pricing !== null);
  const anyMultiLoading = multiFiles.some((f) => f.pricingLoading);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/" className="flex items-center gap-1 hover:text-gray-900 transition-colors">
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/quotes" className="hover:text-gray-900 transition-colors">My Quotes</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">New Quote</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isMultiMode ? `New Quote — ${multiFiles.length} Files` : 'New Quote'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {isMultiMode
              ? `Configure shared options and generate quotes for all ${multiFiles.length} files at once.`
              : 'Upload your CAD file and configure options'}
          </p>
        </div>
          {step === 'configure' && (
          <button
            onClick={resetToUpload}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Start Over
          </button>
        )}
      </div>

      {/* Progress steps — single-file only */}
      {!isMultiMode && (
        <div className="flex items-center gap-2">
          {(['upload', 'configure'] as const).map((s, i) => {
            const steps = ['upload', 'configure'] as const;
            const currentIdx = steps.indexOf(step);
            const isDone = i < currentIdx;
            const isCurrentStep = step === s;
            const labels = ['Upload File', 'Configure & Price'];
            return (
              <div key={s} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      isDone
                        ? 'bg-green-500 text-white'
                        : isCurrentStep
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isDone ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      isCurrentStep ? 'text-primary-700' : isDone ? 'text-green-600' : 'text-gray-400'
                    }`}
                  >
                    {labels[i]}
                  </span>
                </div>
                {i < 1 && (
                  <div className={`h-px w-10 mx-1 ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      {/* Upload step */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload CAD File</h2>
          <FileUpload onFilesUploaded={handleFilesUploaded} />
        </div>
      )}

      {/* Single-file configure */}
      {step === 'configure' && !isMultiMode && config.cadFile && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">3D Preview</h2>
              <ModelViewer
                fileId={config.cadFile.id}
                fileFormat={config.cadFile.file_format}
                geometry={config.geometry || undefined}
              />
              {config.geometry && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  {[
                    { label: 'Volume', value: `${config.geometry.volume.toFixed(2)} cm³` },
                    { label: 'Surface Area', value: `${config.geometry.surface_area.toFixed(2)} cm²` },
                    { label: 'Complexity', value: config.geometry.complexity_score.toFixed(2) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-gray-500">{label}</p>
                      <p className="font-semibold text-gray-900">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {config.geometry && getDFXSeverity(config.geometry) !== 'ok' && (
                <div
                  className={`mt-4 rounded-lg border p-3 text-sm ${
                    getDFXSeverity(config.geometry) === 'error'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                  }`}
                >
                  {getDFXSeverity(config.geometry) === 'error'
                    ? 'DFX Error: This model has manufacturability risks that can block production quality.'
                    : 'DFX Warning: This model may increase machining risk, cost, or lead time.'}
                </div>
              )}
            </div>

            {config.geometry && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">DFX Analysis</h2>
                <DFXAnalysis geometry={config.geometry} />
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h2>
              <ConfigurationPanel
                materialId={config.materialId}
                surfaceFinishId={config.surfaceFinishId}
                inspectionLevelId={config.inspectionLevelId}
                quantity={config.quantity}
                quoteSpecificPricingEnabled={useQuoteSpecificPricing}
                onQuoteSpecificPricingEnabledChange={setUseQuoteSpecificPricing}
                pricingOverrides={pricingOverrides}
                onPricingOverridesChange={setPricingOverrides}
                onMaterialChange={(id) => setConfig((p) => ({ ...p, materialId: id }))}
                onSurfaceFinishChange={(id) => setConfig((p) => ({ ...p, surfaceFinishId: id }))}
                onInspectionLevelChange={(id) => setConfig((p) => ({ ...p, inspectionLevelId: id }))}
                onQuantityChange={(qty) => setConfig((p) => ({ ...p, quantity: qty }))}
              />
            </div>
          </div>

          <div className="space-y-6 lg:sticky lg:top-6 self-start">
            <PricingDisplay pricing={pricing} loading={pricingLoading} />
            {customerForm}
            <button
              onClick={handleCreateSingleQuote}
              disabled={!pricing || creating}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating
                ? <><Loader2 className="w-5 h-5 animate-spin" />Generating Quote...</>
                : <><FileText className="w-5 h-5" />Generate Quote</>}
            </button>
          </div>
        </div>
      )}

      {/* Multi-file configure */}
      {step === 'configure' && isMultiMode && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-gray-900">Files ({multiFiles.length})</h2>
              </div>

              <div className="divide-y divide-gray-100">
                {multiFiles.map((entry, i) => (
                  <div key={entry.cadFile.id} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <span className="w-6 h-6 flex-shrink-0 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 w-full">
                      <p className="font-medium text-gray-900 truncate">{entry.cadFile.original_filename}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.cadFile.file_format.toUpperCase()} &bull;{' '}
                        {entry.geometry.volume.toFixed(2)} cm³ &bull;{' '}
                        complexity {entry.geometry.complexity_score.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">
                      <button
                        onClick={() => setPreviewFile(entry)}
                        className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded border border-blue-200 flex items-center gap-1 whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>3D Preview</span>
                      </button>

                      <div className="text-right flex-shrink-0 min-w-[110px]">
                        {entry.pricingLoading ? (
                          <Loader2 className="w-4 h-4 text-primary-500 animate-spin ml-auto" />
                        ) : entry.pricing ? (
                          <>
                            <p className="font-semibold text-gray-900">
                              {formatINR(entry.pricing.price_breakdown.total_price)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatINR(entry.pricing.price_breakdown.unit_price)}/unit
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">— configure →</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 sm:px-6 py-4 bg-primary-50 border-t border-primary-100 flex justify-between items-center gap-3">
                <div>
                  <p className="font-semibold text-primary-900">Grand Total ({pricedFileCount}/{multiFiles.length} priced)</p>
                  {pendingFileCount > 0 && (
                    <p className="text-xs text-primary-700 mt-0.5">
                      Waiting for pricing for {pendingFileCount} file{pendingFileCount === 1 ? '' : 's'}.
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary-700">{formatINR(multiTotal)}</p>
                  {anyMultiLoading && (
                    <p className="text-xs text-primary-600">Updating...</p>
                  )}
                </div>
              </div>
            </div>

            {customerForm}
          </div>

          <div className="space-y-6 lg:sticky lg:top-6 self-start">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Shared Configuration</h2>
              <p className="text-sm text-gray-500 mb-4">Applies to all {multiFiles.length} files.</p>
              <ConfigurationPanel
                materialId={materialId}
                surfaceFinishId={surfaceFinishId}
                inspectionLevelId={inspectionLevelId}
                quantity={quantity}
                quoteSpecificPricingEnabled={useQuoteSpecificPricing}
                onQuoteSpecificPricingEnabledChange={setUseQuoteSpecificPricing}
                pricingOverrides={pricingOverrides}
                onPricingOverridesChange={setPricingOverrides}
                onMaterialChange={setMaterialId}
                onSurfaceFinishChange={setSurfaceFinishId}
                onInspectionLevelChange={setInspectionLevelId}
                onQuantityChange={setQuantity}
              />
            </div>

            <button
              onClick={handleCreateBatchQuotes}
              disabled={!allMultiPriced || anyMultiLoading || creating}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Creating {multiFiles.length} Quotes...</>
              ) : anyMultiLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Calculating Prices...</>
              ) : (
                <><FileText className="w-5 h-5" />Generate {multiFiles.length} Quotes</>
              )}
            </button>
          </div>

          {previewFile && (
            <FilePreviewModal
              cadFile={previewFile.cadFile}
              geometry={previewFile.geometry}
              onClose={() => setPreviewFile(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default QuoteBuilder;
