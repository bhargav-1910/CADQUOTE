import { useState, type ReactNode } from 'react';
import {
  DollarSign,
  Clock,
  Package,
  Info,
  PencilLine,
  Check,
  X,
  ChevronDown,
  ScanSearch,
  Factory,
  Layers,
  Ruler,
} from 'lucide-react';
import type { PricingResponse, PricingOverrides, QuantityBreak } from '@/types';

interface PricingDisplayProps {
  pricing: PricingResponse | null;
  loading?: boolean;
  editable?: boolean;
  pricingOverrides?: PricingOverrides;
  onPricingOverridesChange?: (patch: PricingOverrides) => void;
}

type EditableField = 'material_cost_per_kg' | 'scrap_cost_per_kg' | 'machine_hourly_rate';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

const formatNumber = (value: number, decimals = 2) => value.toFixed(decimals);

const formatDurationMinutes = (minutes: number) => {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(minutes, 0) : 0;
  const totalSeconds = Math.round(safeMinutes * 60);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins} min ${secs} sec`;
};

/** Collapsible receipt section: header row is always visible, details expand. */
const ReceiptSection = ({
  title,
  amount,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  amount?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium text-gray-800 text-sm">
          {icon}
          {title}
        </span>
        <span className="flex items-center gap-2">
          {amount !== undefined && <span className="font-semibold text-gray-900 text-sm">{amount}</span>}
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open && <div className="px-3.5 py-3 border-t border-gray-100 bg-gray-50/50">{children}</div>}
    </div>
  );
};

const DetailRow = ({ label, value, emphasize = false }: { label: ReactNode; value: ReactNode; emphasize?: boolean }) => (
  <div className={`flex justify-between gap-3 text-sm ${emphasize ? 'text-gray-800 font-medium' : 'text-gray-600'}`}>
    <span>{label}</span>
    <span className="text-right">{value}</span>
  </div>
);

const PricingDisplay = ({
  pricing,
  loading = false,
  editable = false,
  pricingOverrides = {},
  onPricingOverridesChange,
}: PricingDisplayProps) => {
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');

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
  const tolerance = explanation?.tolerance ?? {};
  const marketplace = explanation?.marketplace ?? {};
  const vendorMatch = explanation?.vendor_match ?? {};
  const quantityBreaks = (explanation?.quantity_breaks ?? []) as QuantityBreak[];

  const stockDims = rawMaterial?.raw_material_stock_dimensions_mm as
    | { form?: string; x?: number; y?: number; z?: number; diameter_mm?: number; length_mm?: number }
    | undefined;
  const isRoundBar = stockDims?.form === 'round_bar';
  const stockDimensionText = isRoundBar
    ? `Ø${formatNumber(Number(stockDims?.diameter_mm ?? 0), 1)} × ${formatNumber(Number(stockDims?.length_mm ?? 0), 1)} mm bar`
    : `${formatNumber(Number(stockDims?.x ?? pricing.bounding_box.x * 10), 1)} × ${formatNumber(Number(stockDims?.y ?? pricing.bounding_box.y * 10), 1)} × ${formatNumber(Number(stockDims?.z ?? pricing.bounding_box.z * 10), 1)} mm block`;

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

  const confidence = pricing.dfm_analysis?.confidence_score;
  const matchedVendorName = vendorMatch?.selected?.vendor_name as string | undefined;
  const vendorLoadPct = marketplace?.vendor_load_pct as number | undefined;
  const holeBreakdown = machining?.hole_time_breakdown as
    | { small?: number; medium?: number; large?: number; sized_from_cad?: boolean }
    | undefined;

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

  const editableValue = (field: EditableField, value: number) =>
    editingField === field ? (
      <span className="inline-flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="0.01"
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          className="w-24 px-1.5 py-0.5 border border-gray-300 rounded text-xs"
          autoFocus
        />
        <button type="button" onClick={() => commitEdit(field)} className="text-green-700 hover:text-green-800">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={cancelEdit} className="text-gray-500 hover:text-gray-700">
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5">
        {formatCurrency(value)}
        {canEdit && (
          <button
            type="button"
            onClick={() => beginEdit(field, value)}
            className="text-primary-600 hover:text-primary-700"
          >
            <PencilLine className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
    );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header with total */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-primary-100 text-sm font-medium">Total Price</p>
            <p className="text-3xl font-bold tracking-tight">{formatCurrency(breakdown.total_price)}</p>
          </div>
          <div className="text-right">
            <p className="text-primary-100 text-sm">Unit Price</p>
            <p className="text-xl font-semibold">
              {formatCurrency(breakdown.unit_price)}
              <span className="text-sm font-normal text-primary-200">/unit</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-primary-200" />
            <span>{pricing.quantity} unit{pricing.quantity > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary-200" />
            <span>{formatNumber(pricing.estimated_lead_time_days, 1)} days lead time</span>
          </div>
          {tolerance?.label && (
            <div className="flex items-center gap-1.5">
              <Ruler className="w-4 h-4 text-primary-200" />
              <span>{tolerance.label}</span>
            </div>
          )}
        </div>

        {typeof confidence === 'number' && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
            <ScanSearch className="w-3.5 h-3.5" />
            Estimated from mesh analysis · {(confidence * 100).toFixed(0)}% confidence
          </div>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Line-item summary (the "receipt") */}
        <div>
          <div className="space-y-1">
            {[
              { label: 'Material', sub: pricing.material.name, value: breakdown.material_cost },
              { label: 'Machining', sub: undefined, value: breakdown.machining_cost },
              { label: 'Surface Finish', sub: pricing.surface_finish.name, value: breakdown.finish_cost },
              { label: 'Inspection', sub: pricing.inspection_level.name, value: breakdown.inspection_cost },
            ].map(({ label, sub, value }) => (
              <div key={label} className="flex justify-between items-baseline py-1.5 border-b border-dashed border-gray-200">
                <div>
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  {sub && <span className="ml-2 text-xs text-gray-400">{sub}</span>}
                </div>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(value)}</span>
              </div>
            ))}
            <div className="flex justify-between items-baseline py-1.5 border-b border-dashed border-gray-200">
              <span className="text-sm text-gray-500">Subtotal (per unit)</span>
              <span className="text-sm text-gray-500">{formatCurrency(breakdown.subtotal)}</span>
            </div>
            <div className="flex justify-between items-baseline py-1.5">
              <span className="text-sm text-gray-500">
                Margin &amp; marketplace ({((breakdown.margin_factor - 1) * 100).toFixed(0)}%)
              </span>
              <span className="text-sm text-gray-500">
                {formatCurrency(breakdown.unit_price - breakdown.subtotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Quantity breaks */}
        {quantityBreaks.length > 1 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-gray-400" />
              Price by Quantity
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-4 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <span>Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Total</span>
                <span className="text-right">Savings</span>
              </div>
              {quantityBreaks.map((qb) => (
                <div
                  key={qb.quantity}
                  className={`grid grid-cols-4 px-3 py-1.5 text-sm border-t border-gray-100 ${
                    qb.is_selected ? 'bg-primary-50 font-semibold text-primary-900' : 'text-gray-700'
                  }`}
                >
                  <span>{qb.quantity}{qb.is_selected ? ' •' : ''}</span>
                  <span className="text-right">{formatCurrency(qb.unit_price)}</span>
                  <span className="text-right">{formatCurrency(qb.total_price)}</span>
                  <span className={`text-right ${qb.savings_pct_vs_single > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {qb.savings_pct_vs_single > 0 ? `-${qb.savings_pct_vs_single}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              Setup, programming and tooling amortize across larger batches.
            </p>
          </div>
        )}

        {/* Collapsible cost breakup */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Cost Breakup</h3>
          <div className="space-y-2">
            <ReceiptSection
              title="Raw Material"
              amount={formatCurrency(breakdown.material_cost)}
              icon={<Package className="w-4 h-4 text-gray-400" />}
            >
              <div className="space-y-1.5">
                <DetailRow
                  label={isRoundBar ? 'Round Bar Stock' : 'Stock Dimensions'}
                  value={stockDimensionText}
                />
                <DetailRow
                  label="Raw Material Mass"
                  value={`${formatNumber(Number(rawMaterial.raw_material_mass_kg ?? material.raw_weight_kg ?? pricing.weight_kg), 3)} kg`}
                />
                <DetailRow
                  label="Rate per Kg"
                  value={editableValue('material_cost_per_kg', effectiveMaterialRate)}
                  emphasize
                />
                <DetailRow
                  label={
                    <span className="inline-flex items-center gap-2 text-amber-700">
                      Scrap Saving ({includeScrapSaving ? 'included' : 'excluded'})
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
                  }
                  value={
                    <span className="text-amber-700 font-medium">
                      (-) {formatCurrency(Number(rawMaterial.scrap_saving_cost ?? material.scrap_saving_cost ?? 0))}
                    </span>
                  }
                />
                <DetailRow
                  label="Scrap Weight"
                  value={`${formatNumber(Number(rawMaterial.scrap_weight_kg ?? material.scrap_weight_kg ?? 0), 3)} kg`}
                />
                <DetailRow label="Scrap Rate per Kg" value={editableValue('scrap_cost_per_kg', effectiveScrapRate)} />
              </div>
            </ReceiptSection>

            <ReceiptSection
              title="Machining"
              amount={formatCurrency(breakdown.machining_cost)}
              icon={<Factory className="w-4 h-4 text-gray-400" />}
            >
              <div className="space-y-1.5">
                <DetailRow
                  label="Total Machining Time"
                  value={formatDurationMinutes(Number(manufacturingCharges.cycle_time_min ?? machining.cycle_time_min ?? 0))}
                />
                <DetailRow
                  label="Machine Hour Rate"
                  value={editableValue('machine_hourly_rate', effectiveMachineRate)}
                  emphasize
                />
                <DetailRow
                  label="Feature Time"
                  value={formatDurationMinutes(Number(manufacturingCharges.feature_time_min ?? machining.feature_time_min ?? 0))}
                />
                {holeBreakdown && holeBreakdown.sized_from_cad && (
                  <DetailRow
                    label="Holes (small / med / large)"
                    value={`${holeBreakdown.small ?? 0} / ${holeBreakdown.medium ?? 0} / ${holeBreakdown.large ?? 0}`}
                  />
                )}
                <DetailRow
                  label="Tool Change Time"
                  value={formatDurationMinutes(Number(manufacturingCharges.tool_change_time_min ?? machining.tool_change_time_min ?? 0))}
                />
                {Number(machining.tolerance_time_multiplier ?? 1) > 1 && (
                  <DetailRow
                    label="Tolerance Factor"
                    value={`× ${formatNumber(Number(machining.tolerance_time_multiplier), 2)}`}
                  />
                )}
                {Number(machining.dfm_cycle_multiplier ?? 1) > 1 && (
                  <DetailRow
                    label="DFM Adjustment"
                    value={`× ${formatNumber(Number(machining.dfm_cycle_multiplier), 2)}`}
                  />
                )}
              </div>
            </ReceiptSection>

            <ReceiptSection
              title="Setup, CAM & Tooling"
              amount={formatCurrency(
                Number(setup.setup_cost_per_part ?? 0) +
                  Number(camProgramming.cam_cost_per_part ?? 0) +
                  Number(tooling.tooling_cost_per_part ?? 0),
              )}
              icon={<Info className="w-4 h-4 text-gray-400" />}
            >
              <div className="space-y-1.5">
                <DetailRow
                  label={`Setup (${Number(setup.number_of_setups ?? 1)} setup${Number(setup.number_of_setups ?? 1) > 1 ? 's' : ''}, batch of ${pricing.quantity})`}
                  value={`${formatCurrency(Number(setup.setup_cost_per_part ?? 0))}/part`}
                  emphasize
                />
                <DetailRow
                  label="Total Setup Cost"
                  value={formatCurrency(Number(setup.setup_cost_total ?? 0))}
                />
                <DetailRow
                  label="Setup Time"
                  value={formatDurationMinutes(Number(setup.setup_time_total_hours ?? 0) * 60)}
                />
                <DetailRow
                  label={`CAM Programming (${formatNumber(Number(camProgramming.cam_time_hours ?? 0), 2)} h)`}
                  value={`${formatCurrency(Number(camProgramming.cam_cost_per_part ?? 0))}/part`}
                  emphasize
                />
                <DetailRow
                  label="Tooling Allocation"
                  value={`${formatCurrency(Number(tooling.tooling_cost_per_part ?? 0))}/part`}
                  emphasize
                />
              </div>
            </ReceiptSection>

            <ReceiptSection
              title="Quality & Inspection"
              amount={formatCurrency(Number(quality.inspection_cost_per_part ?? 0))}
              icon={<ScanSearch className="w-4 h-4 text-gray-400" />}
            >
              <div className="space-y-1.5">
                <DetailRow label="Inspection Level" value={String(quality.inspection_level ?? pricing.inspection_level.name)} />
                {Number(quality.tolerance_inspection_multiplier ?? 1) > 1 && (
                  <DetailRow
                    label="Tolerance Inspection Factor"
                    value={`× ${formatNumber(Number(quality.tolerance_inspection_multiplier), 2)}`}
                  />
                )}
                <DetailRow label="Complexity Score" value={formatNumber(pricing.complexity_score, 2)} />
              </div>
            </ReceiptSection>

            {(matchedVendorName || typeof vendorLoadPct === 'number') && (
              <ReceiptSection
                title="Production Partner"
                icon={<Factory className="w-4 h-4 text-gray-400" />}
              >
                <div className="space-y-1.5">
                  {matchedVendorName && <DetailRow label="Matched Vendor" value={matchedVendorName} emphasize />}
                  {typeof vendorLoadPct === 'number' && (
                    <DetailRow label="Current Shop Load" value={`${formatNumber(vendorLoadPct, 0)}%`} />
                  )}
                  {marketplace.dynamic_multiplier !== undefined && (
                    <DetailRow
                      label="Load-based Price Factor"
                      value={`× ${formatNumber(Number(marketplace.dynamic_multiplier), 3)}`}
                    />
                  )}
                  <p className="text-xs text-gray-400 pt-1">
                    Pricing reflects the matched shop's live capacity — quieter shops price lower.
                  </p>
                </div>
              </ReceiptSection>
            )}
          </div>
        </div>
      </div>

      {/* Part info */}
      <div className="border-t border-gray-100 p-5 bg-gray-50">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
          <Info className="w-4 h-4 text-gray-400" />
          Part Information
        </h3>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Dimensions (X×Y×Z)</p>
            <p className="font-medium text-gray-900">
              {formatNumber(pricing.bounding_box.x, 1)} × {formatNumber(pricing.bounding_box.y, 1)} × {formatNumber(pricing.bounding_box.z, 1)} cm
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Volume</p>
            <p className="font-medium text-gray-900">{formatNumber(pricing.volume_cm3)} cm³</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Estimated Weight</p>
            <p className="font-medium text-gray-900">{formatNumber(pricing.weight_kg, 3)} kg</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Material</p>
            <p className="font-medium text-gray-900">{pricing.material.name}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingDisplay;
