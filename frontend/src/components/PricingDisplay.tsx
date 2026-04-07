import { DollarSign, Clock, TrendingUp, Package, Info } from 'lucide-react';
import type { PricingResponse } from '@/types';

interface PricingDisplayProps {
  pricing: PricingResponse | null;
  loading?: boolean;
}

const PricingDisplay = ({ pricing, loading = false }: PricingDisplayProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(value);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toFixed(decimals);
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
          Price Breakdown
        </h3>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Material Cost</p>
              <p className="text-xs text-gray-500">
                {formatNumber(pricing.volume_cm3)} cm³ × {pricing.material.density} g/cm³
              </p>
            </div>
            <p className="font-medium text-gray-900">
              {formatCurrency(breakdown.material_cost)}
            </p>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Machining Cost</p>
              <p className="text-xs text-gray-500">
                Complexity: {formatNumber(pricing.complexity_score, 2)}
              </p>
            </div>
            <p className="font-medium text-gray-900">
              {formatCurrency(breakdown.machining_cost)}
            </p>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Setup Cost Allocation</p>
              <p className="text-xs text-gray-500">
                (Setup Time x Machine Rate) / Batch Size
              </p>
            </div>
            <p className="font-medium text-gray-900">
              {formatCurrency(Number(setup.setup_cost_per_part ?? 0))}/part
            </p>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-700">Programming / CAM Cost</p>
              <p className="text-xs text-gray-500">
                CAM time charged per hour
              </p>
            </div>
            <p className="font-medium text-gray-900">
              {formatCurrency(Number(camProgramming.cam_cost_per_part ?? 0))}/part
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

        <h3 className="font-semibold text-gray-900 mt-6 mb-3">Machining Considerations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">Cycle Time</p>
            <p className="font-semibold text-gray-900">{formatNumber(Number(machining.cycle_time_min ?? 0), 2)} min/part</p>
            <p className="text-xs text-gray-500 mt-1">
              ({formatNumber(Number(manufacturingCharges.material_removal_volume_cm3 ?? 0), 2)} / {formatNumber(Number(manufacturingCharges.mrr_cm3_min ?? 0), 2)}) + {formatNumber(Number(manufacturingCharges.feature_time_min ?? 0), 2)} + {formatNumber(Number(manufacturingCharges.tool_change_time_min ?? 0), 2)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">Setup Time</p>
            <p className="font-semibold text-gray-900">{formatNumber(Number(setup.setup_time_hours ?? 0), 2)} hrs</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">Feature Time</p>
            <p className="font-semibold text-gray-900">{formatNumber(Number(machining.feature_time_min ?? 0), 2)} min</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">Machine Rate</p>
            <p className="font-semibold text-gray-900">{formatCurrency(Number(machining.machine_rate_per_hour ?? 0))}/hr</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">Tool Change Time</p>
            <p className="font-semibold text-gray-900">{formatNumber(Number(machining.tool_change_time_min ?? 0), 2)} min</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">Tooling Allocation</p>
            <p className="font-semibold text-gray-900">{formatCurrency(Number(tooling.tooling_cost_per_part ?? 0))}/part</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">Setup Cost per Part</p>
            <p className="font-semibold text-gray-900">{formatCurrency(Number(setup.setup_cost_per_part ?? 0))}/part</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">CAM Programming</p>
            <p className="font-semibold text-gray-900">{formatCurrency(Number(camProgramming.cam_cost_per_part ?? 0))}/part</p>
            <p className="text-xs text-gray-500 mt-1">{formatNumber(Number(camProgramming.cam_time_hours ?? 0), 2)} hrs at {formatCurrency(Number(camProgramming.cam_rate_per_hour ?? 0))}/hr</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <p className="text-gray-500">Quality Cost</p>
            <p className="font-semibold text-gray-900">{formatCurrency(Number(quality.inspection_cost_per_part ?? 0))}/part</p>
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
