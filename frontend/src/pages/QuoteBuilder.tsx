import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, CheckCircle, Package } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import ModelViewer from '@/components/ModelViewer';
import ConfigurationPanel from '@/components/ConfigurationPanel';
import PricingDisplay from '@/components/PricingDisplay';
import type { CADFile, GeometryAnalysis, PricingResponse, QuoteConfiguration } from '@/types';
import { getInstantPricing, createQuote, createBatchQuote } from '@/services/api';

interface MultiFileEntry {
  cadFile: CADFile;
  geometry: GeometryAnalysis;
  pricing: PricingResponse | null;
  pricingLoading: boolean;
}

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const initialMultiFiles: Array<{ cadFile: CADFile; geometry: GeometryAnalysis }> =
    location.state?.multiFiles ?? [];
  const isMultiMode = initialMultiFiles.length > 1;

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

  // Multi-file state
  const [multiFiles, setMultiFiles] = useState<MultiFileEntry[]>(
    initialMultiFiles.map((f) => ({ ...f, pricing: null, pricingLoading: false }))
  );

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'configure'>(
    initialMultiFiles.length > 0 ? 'configure' : 'upload'
  );

  // Single-file pricing
  const calculateSinglePricing = useCallback(async () => {
    if (!config.cadFile || !config.materialId || !config.surfaceFinishId || !config.inspectionLevelId) return;
    setPricingLoading(true);
    setError(null);
    try {
      const result = await getInstantPricing({
        cad_file_id: config.cadFile.id,
        material_id: config.materialId,
        surface_finish_id: config.surfaceFinishId,
        inspection_level_id: config.inspectionLevelId,
        quantity: config.quantity,
      });
      setPricing(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate pricing');
      setPricing(null);
    } finally {
      setPricingLoading(false);
    }
  }, [config.cadFile, config.materialId, config.surfaceFinishId, config.inspectionLevelId, config.quantity]);

  useEffect(() => {
    if (!isMultiMode) calculateSinglePricing();
  }, [calculateSinglePricing, isMultiMode]);

  // Multi-file pricing: recalculate all when shared config changes
  useEffect(() => {
    if (!isMultiMode || !materialId || !surfaceFinishId || !inspectionLevelId) return;
    setMultiFiles((prev) => prev.map((f) => ({ ...f, pricingLoading: true, pricing: null })));
    initialMultiFiles.forEach((entry, i) => {
      getInstantPricing({
        cad_file_id: entry.cadFile.id,
        material_id: materialId,
        surface_finish_id: surfaceFinishId,
        inspection_level_id: inspectionLevelId,
        quantity,
      })
        .then((result) =>
          setMultiFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, pricing: result, pricingLoading: false } : f))
          )
        )
        .catch(() =>
          setMultiFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, pricingLoading: false } : f))
          )
        );
    });
  }, [materialId, surfaceFinishId, inspectionLevelId, quantity, isMultiMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUploaded = (file: CADFile, geometry: GeometryAnalysis) => {
    setConfig((prev) => ({ ...prev, cadFile: file, geometry }));
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
    setConfig({
      cadFile: null, geometry: null, materialId: null, surfaceFinishId: null,
      inspectionLevelId: null, quantity: 1,
      customerName: '', customerEmail: '', customerCompany: '', notes: '',
    });
    setPricing(null);
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

  const multiTotal = multiFiles.reduce((sum, f) => sum + (f.pricing?.price_breakdown.total_price ?? 0), 0);
  const allMultiPriced = multiFiles.length > 0 && multiFiles.every((f) => f.pricing !== null);
  const anyMultiLoading = multiFiles.some((f) => f.pricingLoading);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isMultiMode ? `New Quote — ${multiFiles.length} Files` : 'New Quote'}
          </h1>
          <p className="text-gray-600">
            {isMultiMode
              ? `Configure shared options and generate quotes for all ${multiFiles.length} files at once.`
              : 'Upload your CAD file and configure options'}
          </p>
        </div>
        {step === 'configure' && (
          <button onClick={resetToUpload} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" />
            Start Over
          </button>
        )}
      </div>

      {/* Progress steps — single-file only */}
      {!isMultiMode && (
        <div className="flex items-center gap-4">
          {(['upload', 'configure'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? 'bg-primary-600 text-white'
                    : i < (['upload', 'configure'] as const).indexOf(step)
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < (['upload', 'configure'] as const).indexOf(step)
                  ? <CheckCircle className="w-5 h-5" />
                  : i + 1}
              </div>
              <span className={`text-sm font-medium capitalize ${step === s ? 'text-primary-600' : 'text-gray-500'}`}>
                {s}
              </span>
              {i < 1 && <div className="w-12 h-0.5 bg-gray-200 ml-2" />}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      {/* Upload step */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload CAD File</h2>
          <FileUpload onFileUploaded={handleFileUploaded} />
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
                <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
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
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h2>
              <ConfigurationPanel
                materialId={config.materialId}
                surfaceFinishId={config.surfaceFinishId}
                inspectionLevelId={config.inspectionLevelId}
                quantity={config.quantity}
                onMaterialChange={(id) => setConfig((p) => ({ ...p, materialId: id }))}
                onSurfaceFinishChange={(id) => setConfig((p) => ({ ...p, surfaceFinishId: id }))}
                onInspectionLevelChange={(id) => setConfig((p) => ({ ...p, inspectionLevelId: id }))}
                onQuantityChange={(qty) => setConfig((p) => ({ ...p, quantity: qty }))}
              />
            </div>
          </div>

          <div className="space-y-6">
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
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-gray-900">Files ({multiFiles.length})</h2>
              </div>

              <div className="divide-y divide-gray-100">
                {multiFiles.map((entry, i) => (
                  <div key={entry.cadFile.id} className="px-6 py-4 flex items-center gap-4">
                    <span className="w-6 h-6 flex-shrink-0 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{entry.cadFile.original_filename}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.cadFile.file_format.toUpperCase()} &bull;{' '}
                        {entry.geometry.volume.toFixed(2)} cm³ &bull;{' '}
                        complexity {entry.geometry.complexity_score.toFixed(2)}
                      </p>
                    </div>
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
                ))}
              </div>

              {allMultiPriced && (
                <div className="px-6 py-4 bg-primary-50 border-t border-primary-100 flex justify-between items-center">
                  <p className="font-semibold text-primary-900">Grand Total ({multiFiles.length} parts)</p>
                  <p className="text-xl font-bold text-primary-700">{formatINR(multiTotal)}</p>
                </div>
              )}
            </div>

            {customerForm}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Shared Configuration</h2>
              <p className="text-sm text-gray-500 mb-4">Applies to all {multiFiles.length} files.</p>
              <ConfigurationPanel
                materialId={materialId}
                surfaceFinishId={surfaceFinishId}
                inspectionLevelId={inspectionLevelId}
                quantity={quantity}
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
        </div>
      )}
    </div>
  );
};

export default QuoteBuilder;
