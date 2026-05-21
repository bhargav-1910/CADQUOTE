import { useState } from 'react';
import { DollarSign, Clock, TrendingUp, Package, Info, PencilLine, Check, X } from 'lucide-react';
import type { PricingResponse, PricingOverrides } from '@/types';

interface PricingDisplayProps {
  pricing: PricingResponse | null;
  loading?: boolean;
  editable?: boolean;
  pricingOverrides?: PricingOverrides;
  onPricingOverridesChange?: (patch: PricingOverrides) => void;
}

type EditableField = 'material_cost_per_kg' | 'scrap_cost_per_kg' | 'machine_hourly_rate';

const PricingDisplay = ({
  pricing,
  loading = false,
  editable = false,
  pricingOverrides = {},
  onPricingOverridesChange,
}: PricingDisplayProps) => {
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(value);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toFixed(decimals);
  };

  const formatDurationMinutes = (minutes: number) => {
    const safeMinutes = Number.isFinite(minutes) ? Math.max(minutes, 0) : 0;
    const totalSeconds = Math.round(safeMinutes * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins} min ${secs} sec`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!pricing) {
    return (
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center">
        <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Upload a file and select options to see pricing</p>
      </div>
    );
  }

  const breakdown = pricing.price_breakdown;
  const explanation = pricing.pricing_explanation as Record<string, any>;
  const machining = explanation?.machining ?? {};
  const setup = explanation?.setup ?? {};
  const camProgramming = explanation?.cam_programming ?? {};
  const manufacturingCharges = explanation?.manufacturing_charges ?? {};
  const tooling = explanation?.tooling ?? {};
  const quality = explanation?.quality ?? {};
  const material = explanation?.material ?? {};
  const rawMaterial = explanation?.raw_material ?? {};

  const stockDims = rawMaterial?.raw_material_stock_dimensions_mm as
    | { x?: number; y?: number; z?: number }
    | undefined;

  const fallbackMaterialRate = Number(
    rawMaterial.raw_material_rate_per_kg ?? material.material_rate_per_kg ?? pricing.material.cost_per_kg,
  );
  const fallbackScrapRate = Number(rawMaterial.scrap_cost_per_kg ?? material.scrap_cost_per_kg ?? 0);
  const fallbackMachineRate = Number(manufacturingCharges.machine_hour_rate ?? machining.machine_rate_per_hour ?? 0);

  const effectiveMaterialRate = Number(pricingOverrides.material_cost_per_kg ?? fallbackMaterialRate);
  const effectiveScrapRate = Number(pricingOverrides.scrap_cost_per_kg ?? fallbackScrapRate);
  const effectiveMachineRate = Number(pricingOverrides.machine_hourly_rate ?? fallbackMachineRate);
  const includeScrapSaving =
    pricingOverrides.include_scrap_saving ??
    Boolean(rawMaterial.scrap_saving_included_in_cost ?? material.scrap_saving_included_in_cost);

  const canEdit = editable && Boolean(onPricingOverridesChange);

  const beginEdit = (field: EditableField, value: number) => {
    if (!canEdit) return;
    setEditingField(field);
    setEditDraft(Number.isFinite(value) ? String(value) : '0');
  };

  const commitEdit = (field: EditableField) => {
    if (!onPricingOverridesChange) return;
    const parsed = Number(editDraft);
    if (!Number.isFinite(parsed)) {
      setEditingField(null);
      return;
    }
    onPricingOverridesChange({ [field]: Math.max(0, parsed) } as PricingOverrides);
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditDraft('');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header with total */}
      <div className="bg-primary-600 text-white p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-primary-100 text-sm font-medium">Total Price</p>
            <p className="text-3xl font-bold">{formatCurrency(breakdown.total_price)}</p>
          </div>
          <div className="text-right">
            <p className="text-primary-100 text-sm">Unit Price</p>
            <p className="text-xl font-semibold">
              {formatCurrency(breakdown.unit_price)}
              <span className="text-sm font-normal text-primary-200">/unit</span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-primary-200" />
            <span>{pricing.quantity} unit{pricing.quantity > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary-200" />
            <span>{formatNumber(pricing.estimated_lead_time_days, 1)} days lead time</span>
          </div>
        </div>
      </div>

      {/* Price breakdown */}
      <div className="p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-400" />
          Price Summary
        </h3>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Material Cost</p>
            </div>
            <p className="font-medium text-gray-900">
              {formatCurrency(breakdown.material_cost)}
            </p>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Machining Cost</p>
            </div>
            <p className="font-medium text-gray-900">
              {formatCurrency(breakdown.machining_cost)}
            </p>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Surface Finish</p>
              <p className="text-xs text-gray-500">{pricing.surface_finish.name}</p>
            </div>
            <p className="font-medium text-gray-900">
              {formatCurrency(breakdown.finish_cost)}
            </p>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Inspection</p>
              <p className="text-xs text-gray-500">{pricing.inspection_level.name}</p>
            </div>
            <p className="font-medium text-gray-900">
              {formatCurrency(breakdown.inspection_cost)}
            </p>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <p className="font-medium text-gray-500">Subtotal (per unit)</p>
            <p className="font-medium text-gray-500">
              {formatCurrency(breakdown.subtotal)}
            </p>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <p className="font-medium text-gray-500">
              Margin ({((breakdown.margin_factor - 1) * 100).toFixed(0)}%)
            </p>
            <p className="font-medium text-gray-500">
              {formatCurrency(breakdown.unit_price - breakdown.subtotal)}
            </p>
          </div>

          {pricing.quantity > 1 && (
            <div className="flex justify-between items-center py-2 bg-green-50 px-3 -mx-3 rounded">
              <p className="font-medium text-green-700">
                Quantity ({pricing.quantity}×)
              </p>
              <p className="font-medium text-green-700">
                × {pricing.quantity}
              </p>
            </div>
          )}
        </div>

        <h3 className="font-semibold text-gray-900 mt-6 mb-3">Cost Breakup</h3>
        <div className="rounded-xl border border-gray-200 p-4 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold text-gray-900">Raw Material Cost</p>
              <p className="font-semibold text-gray-900">{formatCurrency(breakdown.material_cost)}</p>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3 text-gray-600">
                <span>Raw Material Stock Dimension</span>
                <span>
                  {formatNumber(Number(stockDims?.x ?? pricing.bounding_box.x * 10), 1)} × {formatNumber(Number(stockDims?.y ?? pricing.bounding_box.y * 10), 1)} × {formatNumber(Number(stockDims?.z ?? pricing.bounding_box.z * 10), 1)} mm
                </span>
              </div>
              <div className="flex justify-between gap-3 text-gray-600">
                <span>Raw Material Mass</span>
                <span>{formatNumber(Number(rawMaterial.raw_material_mass_kg ?? material.raw_weight_kg ?? pricing.weight_kg), 3)} kg</span>
              </div>
              <div className="flex justify-between gap-3 text-gray-800">
                <span className="font-medium">Raw Material Rate per Kg</span>
                <span className="font-medium inline-flex items-center gap-2">
                  {editingField === 'material_cost_per_kg' ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="w-24 px-1.5 py-0.5 border border-gray-300 rounded text-xs"
                      />
                      <button type="button" onClick={() => commitEdit('material_cost_per_kg')} className="text-green-700 hover:text-green-800">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={cancelEdit} className="text-gray-500 hover:text-gray-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {formatCurrency(effectiveMaterialRate)}
                      {canEdit && (
                        <button type="button" onClick={() => beginEdit('material_cost_per_kg', effectiveMaterialRate)} className="text-primary-600 hover:text-primary-700">
                          <PencilLine className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-amber-700">
                <span className="font-medium inline-flex items-center gap-2">
                  Scrap Saving Cost ({includeScrapSaving ? 'Included in Cost' : 'Not Included'})
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onPricingOverridesChange?.({ include_scrap_saving: !includeScrapSaving })}
                      className="text-[11px] px-1.5 py-0.5 border border-amber-300 rounded text-amber-800 hover:bg-amber-100"
                    >
                      Toggle
                    </button>
                  )}
                </span>
                <span className="font-medium">(-) {formatCurrency(Number(rawMaterial.scrap_saving_cost ?? material.scrap_saving_cost ?? 0))}</span>
              </div>
              <div className="flex justify-between gap-3 text-gray-600">
                <span>Scrap Weight</span>
                <span>{formatNumber(Number(rawMaterial.scrap_weight_kg ?? material.scrap_weight_kg ?? 0), 3)} kg</span>
              </div>
              <div className="flex justify-between gap-3 text-gray-600">
                <span>Scrap Cost per Kg</span>
                <span className="inline-flex items-center gap-2">
                  {editingField === 'scrap_cost_per_kg' ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="w-24 px-1.5 py-0.5 border border-gray-300 rounded text-xs"
                      />
                      <button type="button" onClick={() => commitEdit('scrap_cost_per_kg')} className="text-green-700 hover:text-green-800">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={cancelEdit} className="text-gray-500 hover:text-gray-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {formatCurrency(effectiveScrapRate)}
                      {canEdit && (
                        <button type="button" onClick={() => beginEdit('scrap_cost_per_kg', effectiveScrapRate)} className="text-primary-600 hover:text-primary-700">
                          <PencilLine className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold text-gray-900">Machining Cost</p>
              <p className="font-semibold text-gray-900">{formatCurrency(breakdown.machining_cost)}</p>
            </div>
            <div className="space-y-1.5 text-sm text-gray-600">
              <div className="flex justify-between gap-3">
                <span>Total Machining Time</span>
                <span>{formatDurationMinutes(Number(manufacturingCharges.cycle_time_min ?? machining.cycle_time_min ?? 0))}</span>
              </div>
              <div className="flex justify-between gap-3 text-gray-800">
                <span className="font-medium">Machine Hour Rate</span>
                <span className="font-medium inline-flex items-center gap-2">
                  {editingField === 'machine_hourly_rate' ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="w-24 px-1.5 py-0.5 border border-gray-300 rounded text-xs"
                      />
                      <button type="button" onClick={() => commitEdit('machine_hourly_rate')} className="text-green-700 hover:text-green-800">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={cancelEdit} className="text-gray-500 hover:text-gray-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {formatCurrency(effectiveMachineRate)}
                      {canEdit && (
                        <button type="button" onClick={() => beginEdit('machine_hourly_rate', effectiveMachineRate)} className="text-primary-600 hover:text-primary-700">
                          <PencilLine className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Feature Time</span>
                <span>{formatDurationMinutes(Number(manufacturingCharges.feature_time_min ?? machining.feature_time_min ?? 0))}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Tool Change Time</span>
                <span>{formatDurationMinutes(Number(manufacturingCharges.tool_change_time_min ?? machining.tool_change_time_min ?? 0))}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold text-gray-900">Setup Cost Per Item</p>
              <p className="font-semibold text-gray-900">{formatCurrency(Number(setup.setup_cost_per_part ?? manufacturingCharges.setup_cost_per_part ?? 0))}</p>
            </div>
            <div className="space-y-1.5 text-sm text-gray-600">
              <div className="flex justify-between gap-3">
                <span>Total Setup Cost</span>
                <span>{formatCurrency(Number(setup.setup_cost_total ?? 0))}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Number of Setups</span>
                <span>{Number(setup.number_of_setups ?? manufacturingCharges.number_of_setups ?? 1)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Setup Time</span>
                <span>{formatDurationMinutes(Number(setup.setup_time_total_hours ?? manufacturingCharges.setup_time_total_hours ?? 0) * 60)}</span>
              </div>
              <div className="flex justify-between gap-3 text-gray-800">
                <span className="font-medium">Setup Hour Rate</span>
                <span className="font-medium">{formatCurrency(effectiveMachineRate)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
              <p className="text-gray-500">CAM Programming</p>
              <p className="font-semibold text-gray-900">{formatCurrency(Number(camProgramming.cam_cost_per_part ?? 0))}/part</p>
              <p className="text-xs text-gray-500 mt-1">{formatNumber(Number(camProgramming.cam_time_hours ?? 0), 2)} hrs at {formatCurrency(Number(camProgramming.cam_rate_per_hour ?? 0))}/hr</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
              <p className="text-gray-500">Tooling Allocation</p>
              <p className="font-semibold text-gray-900">{formatCurrency(Number(tooling.tooling_cost_per_part ?? 0))}/part</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
              <p className="text-gray-500">Quality Cost</p>
              <p className="font-semibold text-gray-900">{formatCurrency(Number(quality.inspection_cost_per_part ?? 0))}/part</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
              <p className="text-gray-500">Complexity Score</p>
              <p className="font-semibold text-gray-900">{formatNumber(pricing.complexity_score, 2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Part info */}
      <div className="border-t border-gray-100 p-6 bg-gray-50">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-gray-400" />
          Part Information
        </h3>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Dimensions (X×Y×Z)</p>
            <p className="font-medium text-gray-900">
              {formatNumber(pricing.bounding_box.x, 1)} × {formatNumber(pricing.bounding_box.y, 1)} × {formatNumber(pricing.bounding_box.z, 1)} cm
            </p>
          </div>
          <div>
            <p className="text-gray-500">Volume</p>
            <p className="font-medium text-gray-900">{formatNumber(pricing.volume_cm3)} cm³</p>
          </div>
          <div>
            <p className="text-gray-500">Estimated Weight</p>
            <p className="font-medium text-gray-900">{formatNumber(pricing.weight_kg, 3)} kg</p>
          </div>
          <div>
            <p className="text-gray-500">Material</p>
            <p className="font-medium text-gray-900">{pricing.material.name}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingDisplay;
