import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, CheckCircle } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import ModelViewer from '@/components/ModelViewer';
import ConfigurationPanel from '@/components/ConfigurationPanel';
import PricingDisplay from '@/components/PricingDisplay';
import type { CADFile, GeometryAnalysis, PricingResponse, QuoteConfiguration } from '@/types';
import { getInstantPricing, createQuote } from '@/services/api';

const QuoteBuilder = () => {
  const navigate = useNavigate();
  
  // State
  const [config, setConfig] = useState<QuoteConfiguration>({
    cadFile: null,
    geometry: null,
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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'configure' | 'review'>('upload');

  // Calculate pricing when configuration changes
  const calculatePricing = useCallback(async () => {
    if (
      !config.cadFile ||
      !config.materialId ||
      !config.surfaceFinishId ||
      !config.inspectionLevelId
    ) {
      return;
    }

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
    calculatePricing();
  }, [calculatePricing]);

  // Handlers
  const handleFileUploaded = (file: CADFile, geometry: GeometryAnalysis) => {
    setConfig((prev) => ({ ...prev, cadFile: file, geometry }));
    setStep('configure');
  };

  const handleCreateQuote = async () => {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Quote</h1>
          <p className="text-gray-600">Upload your CAD file and configure options</p>
        </div>
        {step !== 'upload' && (
          <button
            onClick={() => {
              setConfig({
                cadFile: null,
                geometry: null,
                materialId: null,
                surfaceFinishId: null,
                inspectionLevelId: null,
                quantity: 1,
                customerName: '',
                customerEmail: '',
                customerCompany: '',
                notes: '',
              });
              setPricing(null);
              setStep('upload');
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Start Over
          </button>
        )}
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-4">
        {['upload', 'configure', 'review'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? 'bg-primary-600 text-white'
                  : i < ['upload', 'configure', 'review'].indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < ['upload', 'configure', 'review'].indexOf(step) ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-sm font-medium capitalize ${
                step === s ? 'text-primary-600' : 'text-gray-500'
              }`}
            >
              {s}
            </span>
            {i < 2 && <div className="w-12 h-0.5 bg-gray-200 ml-2" />}
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Step content */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Upload CAD File
          </h2>
          <FileUpload onFileUploaded={handleFileUploaded} />
        </div>
      )}

      {step === 'configure' && config.cadFile && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left column - 3D viewer and configuration */}
          <div className="space-y-6">
            {/* 3D Preview */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                3D Preview
              </h2>
              <ModelViewer
                fileId={config.cadFile.id}
                fileFormat={config.cadFile.file_format}
                geometry={config.geometry || undefined}
              />
              
              {/* Geometry info */}
              {config.geometry && (
                <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500">Volume</p>
                    <p className="font-semibold text-gray-900">
                      {config.geometry.volume.toFixed(2)} cm³
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500">Surface Area</p>
                    <p className="font-semibold text-gray-900">
                      {config.geometry.surface_area.toFixed(2)} cm²
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500">Complexity</p>
                    <p className="font-semibold text-gray-900">
                      {config.geometry.complexity_score.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Configuration
              </h2>
              <ConfigurationPanel
                materialId={config.materialId}
                surfaceFinishId={config.surfaceFinishId}
                inspectionLevelId={config.inspectionLevelId}
                quantity={config.quantity}
                onMaterialChange={(id) => setConfig((prev) => ({ ...prev, materialId: id }))}
                onSurfaceFinishChange={(id) => setConfig((prev) => ({ ...prev, surfaceFinishId: id }))}
                onInspectionLevelChange={(id) => setConfig((prev) => ({ ...prev, inspectionLevelId: id }))}
                onQuantityChange={(qty) => setConfig((prev) => ({ ...prev, quantity: qty }))}
              />
            </div>
          </div>

          {/* Right column - Pricing */}
          <div className="space-y-6">
            <PricingDisplay pricing={pricing} loading={pricingLoading} />

            {/* Customer info */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Customer Information (Optional)
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={config.customerName}
                    onChange={(e) => setConfig((prev) => ({ ...prev, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Customer name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={config.customerEmail}
                    onChange={(e) => setConfig((prev) => ({ ...prev, customerEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="customer@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={config.customerCompany}
                    onChange={(e) => setConfig((prev) => ({ ...prev, customerCompany: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={config.notes}
                    onChange={(e) => setConfig((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Any special requirements or notes..."
                  />
                </div>
              </div>
            </div>

            {/* Generate quote button */}
            <button
              onClick={handleCreateQuote}
              disabled={!pricing || creating}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Quote...
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  Generate Quote
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteBuilder;
