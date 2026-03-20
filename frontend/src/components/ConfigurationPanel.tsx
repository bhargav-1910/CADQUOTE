import { useEffect, useState } from 'react';
import { Box, Palette, ClipboardCheck, Loader2, Minus, Plus, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Material, SurfaceFinish, InspectionLevel, PricingOverrides } from '@/types';
import { getMaterials, getSurfaceFinishes, getInspectionLevels } from '@/services/api';

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

interface ConfigurationPanelProps {
  materialId: string | null;
  surfaceFinishId: string | null;
  inspectionLevelId: string | null;
  quantity: number;
  quoteSpecificPricingEnabled?: boolean;
  onQuoteSpecificPricingEnabledChange?: (enabled: boolean) => void;
  pricingOverrides?: PricingOverrides;
  onPricingOverridesChange?: (overrides: PricingOverrides) => void;
  onMaterialChange: (id: string) => void;
  onSurfaceFinishChange: (id: string) => void;
  onInspectionLevelChange: (id: string) => void;
  onQuantityChange: (quantity: number) => void;
  disabled?: boolean;
}

const ConfigurationPanel = ({
  materialId,
  surfaceFinishId,
  inspectionLevelId,
  quantity,
  quoteSpecificPricingEnabled = false,
  onQuoteSpecificPricingEnabledChange,
  pricingOverrides = {},
  onPricingOverridesChange,
  onMaterialChange,
  onSurfaceFinishChange,
  onInspectionLevelChange,
  onQuantityChange,
  disabled = false,
}: ConfigurationPanelProps) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [finishes, setFinishes] = useState<SurfaceFinish[]>([]);
  const [inspections, setInspections] = useState<InspectionLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [mats, fins, insps] = await Promise.all([
          getMaterials(),
          getSurfaceFinishes(),
          getInspectionLevels(),
        ]);
        setMaterials(mats);
        setFinishes(fins);
        setInspections(insps);

        // Set defaults if not selected
        if (!materialId && mats.length > 0) {
          onMaterialChange(mats[0].id);
        }
        if (!surfaceFinishId && fins.length > 0) {
          onSurfaceFinishChange(fins[0].id);
        }
        if (!inspectionLevelId && insps.length > 0) {
          onInspectionLevelChange(insps[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Group materials by category
  const materialsByCategory = materials.reduce((acc, mat) => {
    if (!acc[mat.category]) {
      acc[mat.category] = [];
    }
    acc[mat.category].push(mat);
    return acc;
  }, {} as Record<string, Material[]>);

  const selectedMaterial = materials.find((mat) => mat.id === materialId) ?? null;
  const selectedFinish = finishes.find((finish) => finish.id === surfaceFinishId) ?? null;
  const selectedInspection = inspections.find((inspection) => inspection.id === inspectionLevelId) ?? null;

  const canEditQuoteSpecificPricing = Boolean(
    onQuoteSpecificPricingEnabledChange && onPricingOverridesChange,
  );

  const handleQuoteSpecificToggle = () => {
    if (!onQuoteSpecificPricingEnabledChange) {
      return;
    }

    const nextEnabled = !quoteSpecificPricingEnabled;
    onQuoteSpecificPricingEnabledChange(nextEnabled);

    if (!nextEnabled && onPricingOverridesChange) {
      onPricingOverridesChange({});
    }
  };

  const setOverride = (key: keyof PricingOverrides, value: number) => {
    if (!onPricingOverridesChange) {
      return;
    }

    onPricingOverridesChange({
      ...pricingOverrides,
      [key]: value,
    });
  };

  useEffect(() => {
    if (!quoteSpecificPricingEnabled || !onPricingOverridesChange) {
      return;
    }

    const nextOverrides: PricingOverrides = { ...pricingOverrides };
    let changed = false;

    if (selectedMaterial) {
      const materialCost = Number(selectedMaterial.cost_per_kg);
      const materialDifficulty = Number(selectedMaterial.machining_difficulty_factor);

      if (nextOverrides.material_cost_per_kg !== materialCost) {
        nextOverrides.material_cost_per_kg = materialCost;
        changed = true;
      }

      if (nextOverrides.material_machining_difficulty_factor !== materialDifficulty) {
        nextOverrides.material_machining_difficulty_factor = materialDifficulty;
        changed = true;
      }
    }

    if (selectedFinish) {
      const finishFixedCost = Number(selectedFinish.fixed_cost);
      const finishMultiplier = Number(selectedFinish.cost_multiplier);

      if (nextOverrides.surface_finish_fixed_cost !== finishFixedCost) {
        nextOverrides.surface_finish_fixed_cost = finishFixedCost;
        changed = true;
      }

      if (nextOverrides.surface_finish_cost_multiplier !== finishMultiplier) {
        nextOverrides.surface_finish_cost_multiplier = finishMultiplier;
        changed = true;
      }
    }

    if (selectedInspection) {
      const inspectionFixedCost = Number(selectedInspection.fixed_cost);
      const inspectionPercentage = Number(selectedInspection.percentage_cost);

      if (nextOverrides.inspection_fixed_cost !== inspectionFixedCost) {
        nextOverrides.inspection_fixed_cost = inspectionFixedCost;
        changed = true;
      }

      if (nextOverrides.inspection_percentage_cost !== inspectionPercentage) {
        nextOverrides.inspection_percentage_cost = inspectionPercentage;
        changed = true;
      }
    }

    if (changed) {
      onPricingOverridesChange(nextOverrides);
    }
  }, [
    quoteSpecificPricingEnabled,
    selectedMaterial?.id,
    selectedFinish?.id,
    selectedInspection?.id,
    onPricingOverridesChange,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canEditQuoteSpecificPricing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-900">Quote-Specific Price Editing</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Enable to edit pricing values inline. Changes apply only to this quote.
              </p>
            </div>
            <button
              type="button"
              onClick={handleQuoteSpecificToggle}
              disabled={disabled}
              className={`inline-flex items-center rounded-full h-7 w-12 p-1 transition-colors ${
                quoteSpecificPricingEnabled ? 'bg-primary-600' : 'bg-gray-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
      )}

      {/* Material Selection */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <Box className="w-4 h-4" />
          Raw Material
        </label>
        <div className="space-y-4">
          {Object.entries(materialsByCategory).map(([category, mats]) => (
            <div key={category}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                {category}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mats.map((mat) => {
                  const isSelected = materialId === mat.id;
                  return (
                    <div
                      key={mat.id}
                      className={`p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      } ${disabled ? 'opacity-50' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => onMaterialChange(mat.id)}
                        disabled={disabled}
                        className="w-full text-left"
                      >
                        <p className="font-medium text-gray-900 text-sm">{mat.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatINR(Number(mat.cost_per_kg))}/kg • {mat.density} g/cm³
                        </p>
                      </button>

                      {quoteSpecificPricingEnabled && isSelected && (
                        <div className="mt-2 pt-2 border-t border-primary-100 grid grid-cols-1 gap-2">
                          <p className="text-[11px] font-medium text-primary-700">Quote-only pricing override</p>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-xs text-gray-600">
                              Cost / kg
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                disabled={disabled}
                                value={pricingOverrides.material_cost_per_kg ?? Number(mat.cost_per_kg)}
                                onChange={(e) => setOverride('material_cost_per_kg', Math.max(0.01, Number(e.target.value) || 0.01))}
                                className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </label>
                            <label className="text-xs text-gray-600">
                              Difficulty
                              <input
                                type="number"
                                min="0.5"
                                max="3"
                                step="0.01"
                                disabled={disabled}
                                value={pricingOverrides.material_machining_difficulty_factor ?? Number(mat.machining_difficulty_factor)}
                                onChange={(e) => setOverride('material_machining_difficulty_factor', Math.min(3, Math.max(0.5, Number(e.target.value) || 0.5)))}
                                className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Surface Finish Selection */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <Palette className="w-4 h-4" />
          Surface Finish
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {finishes.map((finish) => {
            const isSelected = surfaceFinishId === finish.id;
            return (
              <div
                key={finish.id}
                className={`p-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onSurfaceFinishChange(finish.id)}
                  disabled={disabled}
                  className="w-full text-left"
                >
                  <p className="font-medium text-gray-900 text-sm">{finish.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {finish.cost_multiplier > 1
                      ? `+${((finish.cost_multiplier - 1) * 100).toFixed(0)}%`
                      : 'Standard'}
                    {Number(finish.fixed_cost) > 0 && ` + ${formatINR(Number(finish.fixed_cost))}`}
                    {finish.lead_time_addition_days > 0 &&
                      ` • +${finish.lead_time_addition_days}d`}
                  </p>
                </button>

                {quoteSpecificPricingEnabled && isSelected && (
                  <div className="mt-2 pt-2 border-t border-primary-100 grid grid-cols-1 gap-2">
                    <p className="text-[11px] font-medium text-primary-700">Quote-only pricing override</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-600">
                        Fixed Cost
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={disabled}
                          value={pricingOverrides.surface_finish_fixed_cost ?? Number(finish.fixed_cost)}
                          onChange={(e) => setOverride('surface_finish_fixed_cost', Math.max(0, Number(e.target.value) || 0))}
                          className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        Multiplier
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          disabled={disabled}
                          value={pricingOverrides.surface_finish_cost_multiplier ?? Number(finish.cost_multiplier)}
                          onChange={(e) => setOverride('surface_finish_cost_multiplier', Math.max(1, Number(e.target.value) || 1))}
                          className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inspection Level Selection */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <ClipboardCheck className="w-4 h-4" />
          Inspection Level
        </label>
        <div className="space-y-2">
          {inspections.map((inspection) => {
            const isSelected = inspectionLevelId === inspection.id;
            return (
              <div
                key={inspection.id}
                className={`w-full p-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onInspectionLevelChange(inspection.id)}
                  disabled={disabled}
                  className="w-full text-left"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{inspection.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{inspection.description}</p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      {Number(inspection.fixed_cost) > 0 && (
                        <span>+{formatINR(Number(inspection.fixed_cost))}</span>
                      )}
                      {inspection.percentage_cost > 0 && (
                        <span> +{inspection.percentage_cost}%</span>
                      )}
                      {Number(inspection.fixed_cost) === 0 && inspection.percentage_cost === 0 && (
                        <span>Included</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {inspection.includes_certificate && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        Certificate
                      </span>
                    )}
                    {inspection.includes_cmm_report && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        CMM Report
                      </span>
                    )}
                  </div>
                </button>

                {quoteSpecificPricingEnabled && isSelected && (
                  <div className="mt-2 pt-2 border-t border-primary-100 grid grid-cols-1 gap-2">
                    <p className="text-[11px] font-medium text-primary-700">Quote-only pricing override</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-600">
                        Fixed Cost
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={disabled}
                          value={pricingOverrides.inspection_fixed_cost ?? Number(inspection.fixed_cost)}
                          onChange={(e) => setOverride('inspection_fixed_cost', Math.max(0, Number(e.target.value) || 0))}
                          className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        Percentage
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          disabled={disabled}
                          value={pricingOverrides.inspection_percentage_cost ?? Number(inspection.percentage_cost)}
                          onChange={(e) => setOverride('inspection_percentage_cost', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                          className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quantity */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          Quantity
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            disabled={disabled || quantity <= 1}
            className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number"
            min="1"
            max="10000"
            value={quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1;
              onQuantityChange(Math.max(1, Math.min(10000, val)));
            }}
            disabled={disabled}
            className="w-24 h-10 text-center border border-gray-300 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={() => onQuantityChange(Math.min(10000, quantity + 1))}
            disabled={disabled || quantity >= 10000}
            className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-500">units</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Volume discounts: 5+ (5%), 10+ (10%), 25+ (15%), 50+ (20%), 100+ (25%)
        </p>
      </div>

      {/* Admin pricing link */}
      <div className="border-t border-gray-100 pt-4">
        <Link
          to="/admin/pricing"
          className="flex items-center gap-2 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Customize Pricing Values
        </Link>
      </div>
    </div>
  );
};

export default ConfigurationPanel;
