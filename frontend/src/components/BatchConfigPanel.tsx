import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getMaterials, getSurfaceFinishes, getInspectionLevels } from '@/services/api';
import type { Material, SurfaceFinish, InspectionLevel, PricingOverrides } from '@/types';

interface BatchConfig {
  material_id: string;
  surface_finish_id: string;
  inspection_level_id: string;
  quantity: number;
  pricing_overrides?: PricingOverrides;
}

interface BatchConfigPanelProps {
  onClose: () => void;
  onApply: (config: BatchConfig) => void;
  selectedCount: number;
}

const BatchConfigPanel = ({ onClose, onApply, selectedCount }: BatchConfigPanelProps) => {
  const [config, setConfig] = useState<BatchConfig>({
    material_id: '',
    surface_finish_id: '',
    inspection_level_id: '',
    quantity: 1,
  });

  const [materials, setMaterials] = useState<Material[]>([]);
  const [finishes, setFinishes] = useState<SurfaceFinish[]>([]);
  const [inspectionLevels, setInspectionLevels] = useState<InspectionLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteSpecificPricingEnabled, setQuoteSpecificPricingEnabled] = useState(false);

  const selectedMaterial = materials.find((m) => m.id === config.material_id);
  const selectedFinish = finishes.find((f) => f.id === config.surface_finish_id);
  const selectedInspection = inspectionLevels.find((i) => i.id === config.inspection_level_id);

  const withDefaultOverrides = (baseConfig: BatchConfig): BatchConfig => {
    if (!quoteSpecificPricingEnabled) {
      return baseConfig;
    }

    return {
      ...baseConfig,
      pricing_overrides: {
        ...(baseConfig.pricing_overrides ?? {}),
        ...(selectedMaterial
          ? {
              material_cost_per_kg: Number(selectedMaterial.cost_per_kg),
              material_machining_difficulty_factor: Number(selectedMaterial.machining_difficulty_factor),
            }
          : {}),
        ...(selectedFinish
          ? {
              surface_finish_fixed_cost: Number(selectedFinish.fixed_cost),
              surface_finish_cost_multiplier: Number(selectedFinish.cost_multiplier),
            }
          : {}),
        ...(selectedInspection
          ? {
              inspection_fixed_cost: Number(selectedInspection.fixed_cost),
              inspection_percentage_cost: Number(selectedInspection.percentage_cost),
            }
          : {}),
      },
    };
  };

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [mats, fins, inspections] = await Promise.all([
          getMaterials(),
          getSurfaceFinishes(),
          getInspectionLevels(),
        ]);
        setMaterials(mats);
        setFinishes(fins);
        setInspectionLevels(inspections);

        // Set defaults
        if (mats.length > 0) setConfig((c) => ({ ...c, material_id: mats[0].id }));
        if (fins.length > 0) setConfig((c) => ({ ...c, surface_finish_id: fins[0].id }));
        if (inspections.length > 0)
          setConfig((c) => ({ ...c, inspection_level_id: inspections[0].id }));
      } catch (err) {
        console.error('Failed to load configuration options', err);
      } finally {
        setLoading(false);
      }
    };

    loadOptions();
  }, []);

  const isValid =
    config.material_id &&
    config.surface_finish_id &&
    config.inspection_level_id &&
    config.quantity > 0;

  const updateOverride = (key: keyof PricingOverrides, value: number) => {
    setConfig((prev) => ({
      ...prev,
      pricing_overrides: {
        ...(prev.pricing_overrides ?? {}),
        [key]: value,
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Batch Configuration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Apply configuration to {selectedCount} selected file{selectedCount !== 1 ? 's' : ''}
        </p>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Quote-Specific Price Editing</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Enable to edit pricing values inline for this batch only.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQuoteSpecificPricingEnabled((prev) => {
                      const next = !prev;
                      setConfig((current) => {
                        if (!next) {
                          return {
                            ...current,
                            pricing_overrides: undefined,
                          };
                        }

                        return withDefaultOverrides(current);
                      });
                      return next;
                    });
                  }}
                  className={`inline-flex items-center rounded-full h-7 w-12 p-1 transition-colors ${
                    quoteSpecificPricingEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  aria-pressed={quoteSpecificPricingEnabled}
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-white transition-transform ${
                      quoteSpecificPricingEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Material */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Material</label>
              <select
                value={config.material_id}
                onChange={(e) => {
                  const nextMaterialId = e.target.value;
                  const material = materials.find((m) => m.id === nextMaterialId);
                  setConfig((prev) => {
                    const next: BatchConfig = {
                      ...prev,
                      material_id: nextMaterialId,
                    };

                    if (quoteSpecificPricingEnabled && material) {
                      next.pricing_overrides = {
                        ...(prev.pricing_overrides ?? {}),
                        material_cost_per_kg: Number(material.cost_per_kg),
                        material_machining_difficulty_factor: Number(material.machining_difficulty_factor),
                      };
                    }

                    return next;
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a material</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              {quoteSpecificPricingEnabled && selectedMaterial && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-600">
                    Cost / kg
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={config.pricing_overrides?.material_cost_per_kg ?? Number(selectedMaterial.cost_per_kg)}
                      onChange={(e) => updateOverride('material_cost_per_kg', Math.max(0.01, Number(e.target.value) || 0.01))}
                      className="mt-1 w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Difficulty
                    <input
                      type="number"
                      min="0.5"
                      max="3"
                      step="0.01"
                      value={config.pricing_overrides?.material_machining_difficulty_factor ?? Number(selectedMaterial.machining_difficulty_factor)}
                      onChange={(e) => updateOverride('material_machining_difficulty_factor', Math.min(3, Math.max(0.5, Number(e.target.value) || 0.5)))}
                      className="mt-1 w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Surface Finish */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Surface Finish
              </label>
              <select
                value={config.surface_finish_id}
                onChange={(e) => {
                  const nextFinishId = e.target.value;
                  const finish = finishes.find((f) => f.id === nextFinishId);
                  setConfig((prev) => {
                    const next: BatchConfig = {
                      ...prev,
                      surface_finish_id: nextFinishId,
                    };

                    if (quoteSpecificPricingEnabled && finish) {
                      next.pricing_overrides = {
                        ...(prev.pricing_overrides ?? {}),
                        surface_finish_fixed_cost: Number(finish.fixed_cost),
                        surface_finish_cost_multiplier: Number(finish.cost_multiplier),
                      };
                    }

                    return next;
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a finish</option>
                {finishes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>

              {quoteSpecificPricingEnabled && selectedFinish && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-600">
                    Fixed Cost
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={config.pricing_overrides?.surface_finish_fixed_cost ?? Number(selectedFinish.fixed_cost)}
                      onChange={(e) => updateOverride('surface_finish_fixed_cost', Math.max(0, Number(e.target.value) || 0))}
                      className="mt-1 w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Multiplier
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={config.pricing_overrides?.surface_finish_cost_multiplier ?? Number(selectedFinish.cost_multiplier)}
                      onChange={(e) => updateOverride('surface_finish_cost_multiplier', Math.max(1, Number(e.target.value) || 1))}
                      className="mt-1 w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Inspection Level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Inspection Level
              </label>
              <select
                value={config.inspection_level_id}
                onChange={(e) => {
                  const nextInspectionId = e.target.value;
                  const inspection = inspectionLevels.find((i) => i.id === nextInspectionId);
                  setConfig((prev) => {
                    const next: BatchConfig = {
                      ...prev,
                      inspection_level_id: nextInspectionId,
                    };

                    if (quoteSpecificPricingEnabled && inspection) {
                      next.pricing_overrides = {
                        ...(prev.pricing_overrides ?? {}),
                        inspection_fixed_cost: Number(inspection.fixed_cost),
                        inspection_percentage_cost: Number(inspection.percentage_cost),
                      };
                    }

                    return next;
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select inspection level</option>
                {inspectionLevels.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>

              {quoteSpecificPricingEnabled && selectedInspection && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-600">
                    Fixed Cost
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={config.pricing_overrides?.inspection_fixed_cost ?? Number(selectedInspection.fixed_cost)}
                      onChange={(e) => updateOverride('inspection_fixed_cost', Math.max(0, Number(e.target.value) || 0))}
                      className="mt-1 w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Percentage
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={config.pricing_overrides?.inspection_percentage_cost ?? Number(selectedInspection.percentage_cost)}
                      onChange={(e) => updateOverride('inspection_percentage_cost', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                      className="mt-1 w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
              <input
                type="number"
                min="1"
                value={config.quantity}
                onChange={(e) => setConfig({ ...config, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-6">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  onApply({
                    ...config,
                    pricing_overrides: quoteSpecificPricingEnabled ? config.pricing_overrides : undefined,
                  })
                }
                disabled={!isValid}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
              >
                Apply to Selected
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchConfigPanel;
