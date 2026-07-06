import { useEffect, useRef, useState } from 'react';
import { Box, Palette, ClipboardCheck, Loader2, Minus, Plus, Ruler } from 'lucide-react';
import type { Material, SurfaceFinish, InspectionLevel, PricingOverrides, ToleranceTier } from '@/types';
import { getMaterials, getSurfaceFinishes, getInspectionLevels, getMachineRates, type MachineRate } from '@/services/api';

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

type OverrideKey = keyof PricingOverrides;

const TOLERANCE_OPTIONS: { value: ToleranceTier; label: string; spec: string; hint: string }[] = [
  { value: 'general', label: 'General', spec: '±0.10 mm', hint: 'Standard machining, no price impact' },
  { value: 'precision', label: 'Precision', spec: '±0.05 mm', hint: 'Slower feeds + extra inspection' },
  { value: 'tight', label: 'Tight', spec: '±0.01 mm', hint: 'Finishing passes, CMM-level checks' },
];

interface ConfigurationPanelProps {
  materialId: string | null;
  surfaceFinishId: string | null;
  inspectionLevelId: string | null;
  quantity: number;
  toleranceTier?: ToleranceTier;
  onToleranceTierChange?: (tier: ToleranceTier) => void;
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
  toleranceTier = 'general',
  onToleranceTierChange,
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
  const [machineRates, setMachineRates] = useState<MachineRate[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrideDrafts, setOverrideDrafts] = useState<Partial<Record<OverrideKey, string>>>({});
  const overrideDebounceTimers = useRef<Partial<Record<OverrideKey, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [mats, fins, insps, machines] = await Promise.all([
          getMaterials(),
          getSurfaceFinishes(),
          getInspectionLevels(),
          getMachineRates(),
        ]);
        setMaterials(mats);
        setFinishes(fins);
        setInspections(insps);
        setMachineRates(machines);

        const defaultMachine = machines.find((m) => m.is_default) ?? machines[0];
        if (defaultMachine) {
          setSelectedMachineId(defaultMachine.id);
        }

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

  useEffect(() => {
    return () => {
      Object.values(overrideDebounceTimers.current).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
    };
  }, []);

  const materialsByCategory = materials.reduce((acc, mat) => {
    if (!acc[mat.category]) {
      acc[mat.category] = [];
    }
    acc[mat.category].push(mat);
    return acc;
  }, {} as Record<string, Material[]>);

  const canEditQuoteSpecificPricing = Boolean(
    onQuoteSpecificPricingEnabledChange && onPricingOverridesChange,
  );

  const selectedMaterial = materials.find((mat) => mat.id === materialId);
  const selectedFinish = finishes.find((finish) => finish.id === surfaceFinishId);
  const selectedInspection = inspections.find((inspection) => inspection.id === inspectionLevelId);
  const selectedMachine = machineRates.find((machine) => machine.id === selectedMachineId);

  const syncOverridesFromSelection = (options?: {
    includeMaterial?: boolean;
    includeFinish?: boolean;
    includeInspection?: boolean;
  }) => {
    if (!quoteSpecificPricingEnabled || !onPricingOverridesChange) {
      return;
    }

    const next = applySelectionDefaultsToOverrides(pricingOverrides, options);
    onPricingOverridesChange(next);
    setOverrideDrafts((prev) => ({
      ...prev,
      ...(next.material_cost_per_kg !== undefined ? { material_cost_per_kg: String(next.material_cost_per_kg) } : {}),
      ...(next.material_density !== undefined ? { material_density: String(next.material_density) } : {}),
      ...(next.material_machining_difficulty_factor !== undefined
        ? { material_machining_difficulty_factor: String(next.material_machining_difficulty_factor) }
        : {}),
      ...(next.scrap_cost_per_kg !== undefined ? { scrap_cost_per_kg: String(next.scrap_cost_per_kg) } : {}),
      ...(next.surface_finish_fixed_cost !== undefined
        ? { surface_finish_fixed_cost: String(next.surface_finish_fixed_cost) }
        : {}),
      ...(next.surface_finish_cost_multiplier !== undefined
        ? { surface_finish_cost_multiplier: String(next.surface_finish_cost_multiplier) }
        : {}),
      ...(next.surface_finish_rate_per_kg !== undefined
        ? { surface_finish_rate_per_kg: String(next.surface_finish_rate_per_kg) }
        : {}),
      ...(next.surface_finish_rate_per_sq_inch !== undefined
        ? { surface_finish_rate_per_sq_inch: String(next.surface_finish_rate_per_sq_inch) }
        : {}),
      ...(next.surface_finish_rate_per_sq_ft !== undefined
        ? { surface_finish_rate_per_sq_ft: String(next.surface_finish_rate_per_sq_ft) }
        : {}),
      ...(next.surface_finish_rate_per_piece !== undefined
        ? { surface_finish_rate_per_piece: String(next.surface_finish_rate_per_piece) }
        : {}),
      ...(next.inspection_fixed_cost !== undefined ? { inspection_fixed_cost: String(next.inspection_fixed_cost) } : {}),
      ...(next.inspection_percentage_cost !== undefined
        ? { inspection_percentage_cost: String(next.inspection_percentage_cost) }
        : {}),
      ...(next.machine_hourly_rate !== undefined ? { machine_hourly_rate: String(next.machine_hourly_rate) } : {}),
      ...(next.machine_setup_hourly_rate !== undefined
        ? { machine_setup_hourly_rate: String(next.machine_setup_hourly_rate) }
        : {}),
      ...(next.machine_efficiency_rate !== undefined
        ? { machine_efficiency_rate: String(next.machine_efficiency_rate) }
        : {}),
      ...(next.machine_setup_time_hours !== undefined
        ? { machine_setup_time_hours: String(next.machine_setup_time_hours) }
        : {}),
    }));
  };

  const applySelectionDefaultsToOverrides = (
    current: PricingOverrides,
    options?: {
      includeMaterial?: boolean;
      includeFinish?: boolean;
      includeInspection?: boolean;
      includeMachine?: boolean;
    },
  ) => {
    const includeMaterial = options?.includeMaterial ?? true;
    const includeFinish = options?.includeFinish ?? true;
    const includeInspection = options?.includeInspection ?? true;
    const includeMachine = options?.includeMachine ?? true;

    const next: PricingOverrides = { ...current };

    if (includeMaterial && selectedMaterial) {
      next.material_cost_per_kg = Number(selectedMaterial.cost_per_kg);
      next.material_density = Number(selectedMaterial.density);
      next.material_machining_difficulty_factor = Number(selectedMaterial.machining_difficulty_factor);
      next.scrap_cost_per_kg = Number(selectedMaterial.scrap_cost_per_kg);
    }

    if (includeFinish && selectedFinish) {
      next.surface_finish_fixed_cost = Number(selectedFinish.fixed_cost);
      next.surface_finish_cost_multiplier = Number(selectedFinish.cost_multiplier);
      next.surface_finish_rate_per_kg = Number(selectedFinish.rate_per_kg);
      next.surface_finish_rate_per_sq_inch = Number(selectedFinish.rate_per_sq_inch);
      next.surface_finish_rate_per_sq_ft = Number(selectedFinish.rate_per_sq_ft);
      next.surface_finish_rate_per_piece = Number(selectedFinish.rate_per_piece);
    }

    if (includeInspection && selectedInspection) {
      next.inspection_fixed_cost = Number(selectedInspection.fixed_cost);
      next.inspection_percentage_cost = Number(selectedInspection.percentage_cost);
    }

    if (includeMachine && selectedMachine) {
      next.machine_name = selectedMachine.name;
      next.machine_hourly_rate = Number(selectedMachine.hourly_rate);
      next.machine_setup_hourly_rate = Number(selectedMachine.setup_hour_rate);
      next.machine_efficiency_rate = Number(selectedMachine.efficiency_rate);
      next.machine_setup_time_hours = Number(selectedMachine.setup_time_hours);
    }

    return next;
  };

  const handleQuoteSpecificToggle = () => {
    if (!onQuoteSpecificPricingEnabledChange) {
      return;
    }

    const nextEnabled = !quoteSpecificPricingEnabled;
    onQuoteSpecificPricingEnabledChange(nextEnabled);

    if (!onPricingOverridesChange) {
      return;
    }

    if (!nextEnabled) {
      onPricingOverridesChange({});
      setOverrideDrafts({});
      return;
    }

    syncOverridesFromSelection();
  };

  const handleMaterialSelect = (id: string) => {
    onMaterialChange(id);
    if (!quoteSpecificPricingEnabled || !onPricingOverridesChange) {
      return;
    }

    const selected = materials.find((mat) => mat.id === id);
    if (!selected) {
      return;
    }

    const next = {
      ...pricingOverrides,
      material_cost_per_kg: Number(selected.cost_per_kg),
      material_density: Number(selected.density),
      material_machining_difficulty_factor: Number(selected.machining_difficulty_factor),
      scrap_cost_per_kg: Number(selected.scrap_cost_per_kg),
    };
    onPricingOverridesChange(next);
    setOverrideDrafts((prev) => ({
      ...prev,
      material_cost_per_kg: String(Number(selected.cost_per_kg)),
      material_density: String(Number(selected.density)),
      material_machining_difficulty_factor: String(Number(selected.machining_difficulty_factor)),
      scrap_cost_per_kg: String(Number(selected.scrap_cost_per_kg)),
    }));
  };

  const handleFinishSelect = (id: string) => {
    onSurfaceFinishChange(id);
    if (!quoteSpecificPricingEnabled || !onPricingOverridesChange) {
      return;
    }

    const selected = finishes.find((finish) => finish.id === id);
    if (!selected) {
      return;
    }

    const next = {
      ...pricingOverrides,
      surface_finish_fixed_cost: Number(selected.fixed_cost),
      surface_finish_cost_multiplier: Number(selected.cost_multiplier),
      surface_finish_rate_per_kg: Number(selected.rate_per_kg),
      surface_finish_rate_per_sq_inch: Number(selected.rate_per_sq_inch),
      surface_finish_rate_per_sq_ft: Number(selected.rate_per_sq_ft),
      surface_finish_rate_per_piece: Number(selected.rate_per_piece),
    };
    onPricingOverridesChange(next);
    setOverrideDrafts((prev) => ({
      ...prev,
      surface_finish_fixed_cost: String(Number(selected.fixed_cost)),
      surface_finish_cost_multiplier: String(Number(selected.cost_multiplier)),
      surface_finish_rate_per_kg: String(Number(selected.rate_per_kg)),
      surface_finish_rate_per_sq_inch: String(Number(selected.rate_per_sq_inch)),
      surface_finish_rate_per_sq_ft: String(Number(selected.rate_per_sq_ft)),
      surface_finish_rate_per_piece: String(Number(selected.rate_per_piece)),
    }));
  };

  const handleMachineSelect = (id: string) => {
    setSelectedMachineId(id);
    if (!quoteSpecificPricingEnabled || !onPricingOverridesChange) {
      return;
    }

    const selected = machineRates.find((machine) => machine.id === id);
    if (!selected) {
      return;
    }

    onPricingOverridesChange({
      ...pricingOverrides,
      machine_name: selected.name,
      machine_hourly_rate: Number(selected.hourly_rate),
      machine_setup_hourly_rate: Number(selected.setup_hour_rate),
      machine_efficiency_rate: Number(selected.efficiency_rate),
      machine_setup_time_hours: Number(selected.setup_time_hours),
    });
    setOverrideDrafts((prev) => ({
      ...prev,
      machine_hourly_rate: String(Number(selected.hourly_rate)),
      machine_setup_hourly_rate: String(Number(selected.setup_hour_rate)),
      machine_efficiency_rate: String(Number(selected.efficiency_rate)),
      machine_setup_time_hours: String(Number(selected.setup_time_hours)),
    }));
  };

  const handleInspectionSelect = (id: string) => {
    onInspectionLevelChange(id);
    if (!quoteSpecificPricingEnabled || !onPricingOverridesChange) {
      return;
    }

    const selected = inspections.find((inspection) => inspection.id === id);
    if (!selected) {
      return;
    }

    const next = {
      ...pricingOverrides,
      inspection_fixed_cost: Number(selected.fixed_cost),
      inspection_percentage_cost: Number(selected.percentage_cost),
    };
    onPricingOverridesChange(next);
    setOverrideDrafts((prev) => ({
      ...prev,
      inspection_fixed_cost: String(Number(selected.fixed_cost)),
      inspection_percentage_cost: String(Number(selected.percentage_cost)),
    }));
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

  const removeOverride = (key: OverrideKey) => {
    if (!onPricingOverridesChange) {
      return;
    }

    const next = { ...pricingOverrides };
    delete next[key];
    onPricingOverridesChange(next);
  };

  const setDraft = (key: OverrideKey, value: string) => {
    setOverrideDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const getDraftValue = (key: OverrideKey, fallback: number) => {
    if (overrideDrafts[key] !== undefined) {
      return overrideDrafts[key] as string;
    }
    const overrideValue = pricingOverrides[key];
    return overrideValue !== undefined ? String(overrideValue) : String(fallback);
  };

  const applyNumericOverrideInput = (key: OverrideKey, raw: string) => {
    setDraft(key, raw);

    const existingTimer = overrideDebounceTimers.current[key];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (raw.trim() === '') {
      removeOverride(key);
      return;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return;
    }

    overrideDebounceTimers.current[key] = setTimeout(() => {
      setOverride(key, parsed);
    }, 300);
  };

  const commitNumericOverrideInput = (
    key: OverrideKey,
    fallback: number,
    options?: { min?: number; max?: number },
  ) => {
    const existingTimer = overrideDebounceTimers.current[key];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete overrideDebounceTimers.current[key];
    }

    const raw = overrideDrafts[key];
    const source = raw !== undefined ? raw : String(pricingOverrides[key] ?? fallback);
    const parsed = Number(source);

    let nextValue = Number.isFinite(parsed) ? parsed : fallback;
    if (options?.min !== undefined) {
      nextValue = Math.max(options.min, nextValue);
    }
    if (options?.max !== undefined) {
      nextValue = Math.min(options.max, nextValue);
    }

    setOverride(key, nextValue);
    setDraft(key, String(nextValue));
  };

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
    <div className="space-y-5">
      {canEditQuoteSpecificPricing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-900">Quote-Specific Price Editing</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Enable to edit pricing values inline. Changes apply only to this quote.
              </p>
              {quoteSpecificPricingEnabled && (
                <p className="text-[11px] text-amber-800 mt-1">
                  Pricing updates automatically as you type.
                </p>
              )}
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

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <Box className="w-4 h-4" />
          Raw Material
        </label>
        <select
          value={materialId ?? ''}
          onChange={(e) => handleMaterialSelect(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-sm"
        >
          {Object.entries(materialsByCategory).map(([category, mats]) => (
            <optgroup key={category} label={category}>
              {mats.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name} - {formatINR(Number(mat.cost_per_kg))}/kg
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedMaterial && (
          <div className="mt-2 text-xs text-gray-500 space-y-1">
            <p>{selectedMaterial.name}: {formatINR(Number(selectedMaterial.cost_per_kg))}/kg</p>
            {selectedMaterial.common_names && <p>Common Name: {selectedMaterial.common_names}</p>}
            <p>Density: {selectedMaterial.density} g/cm3 | Scrap Saving Cost: {formatINR(Number(selectedMaterial.scrap_cost_per_kg))}/kg</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <Palette className="w-4 h-4" />
          Surface Finish
        </label>
        <select
          value={surfaceFinishId ?? ''}
          onChange={(e) => handleFinishSelect(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-sm"
        >
          {finishes.map((finish) => (
            <option key={finish.id} value={finish.id}>
              {finish.name}
            </option>
          ))}
        </select>
        {selectedFinish && (
          <div className="mt-2 text-xs text-gray-500 space-y-1">
            <p>
              {selectedFinish.cost_multiplier > 1
                ? `+${((selectedFinish.cost_multiplier - 1) * 100).toFixed(0)}%`
                : 'Standard'}
              {Number(selectedFinish.fixed_cost) > 0 && ` + ${formatINR(Number(selectedFinish.fixed_cost))}`}
              {selectedFinish.lead_time_addition_days > 0 && ` • +${selectedFinish.lead_time_addition_days}d lead time`}
            </p>
            <p>
              Rate/kg: {formatINR(Number(selectedFinish.rate_per_kg))} | Rate/sq.in: {formatINR(Number(selectedFinish.rate_per_sq_inch))} | Rate/sq.ft: {formatINR(Number(selectedFinish.rate_per_sq_ft))} | Rate/piece: {formatINR(Number(selectedFinish.rate_per_piece))}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          Machining Process
        </label>
        <select
          value={selectedMachineId}
          onChange={(e) => handleMachineSelect(e.target.value)}
          disabled={disabled || machineRates.length === 0}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-sm"
        >
          {machineRates.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.name}
            </option>
          ))}
        </select>
        {selectedMachine && (
          <p className="mt-2 text-xs text-gray-500">
            Machine Hour Rate: {formatINR(Number(selectedMachine.hourly_rate))}/hr | Setup Hour Rate: {formatINR(Number(selectedMachine.setup_hour_rate))}/hr | Setup Time: {selectedMachine.setup_time_hours} h
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <ClipboardCheck className="w-4 h-4" />
          Inspection Level
        </label>
        <select
          value={inspectionLevelId ?? ''}
          onChange={(e) => handleInspectionSelect(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-sm"
        >
          {inspections.map((inspection) => (
            <option key={inspection.id} value={inspection.id}>
              {inspection.name}
            </option>
          ))}
        </select>
        {selectedInspection && (
          <div className="mt-2 text-xs text-gray-500 space-y-1">
            <p>{selectedInspection.description}</p>
            <p>
              {Number(selectedInspection.fixed_cost) > 0
                ? `+${formatINR(Number(selectedInspection.fixed_cost))}`
                : 'Included'}
              {selectedInspection.percentage_cost > 0 && ` +${selectedInspection.percentage_cost}%`}
            </p>
          </div>
        )}
      </div>

      {onToleranceTierChange && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <Ruler className="w-4 h-4" />
            Tolerance Requirement
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TOLERANCE_OPTIONS.map((option) => {
              const active = toleranceTier === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToleranceTierChange(option.value)}
                  className={`rounded-lg border px-2 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <p className={`text-sm font-semibold ${active ? 'text-primary-800' : 'text-gray-800'}`}>
                    {option.label}
                  </p>
                  <p className={`text-xs font-medium ${active ? 'text-primary-600' : 'text-gray-500'}`}>
                    {option.spec}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {TOLERANCE_OPTIONS.find((option) => option.value === toleranceTier)?.hint}
          </p>
        </div>
      )}

      {quoteSpecificPricingEnabled && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-primary-900">Quote-Specific Overrides</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => syncOverridesFromSelection()}
                className="px-2.5 py-1.5 text-xs rounded border border-primary-300 text-primary-700 hover:bg-primary-100 disabled:opacity-50"
              >
                Sync from selection
              </button>
              <button
                type="button"
                disabled={disabled || !onPricingOverridesChange}
                onClick={() => {
                  if (!onPricingOverridesChange) return;
                  onPricingOverridesChange({});
                  setOverrideDrafts({});
                }}
                className="px-2.5 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Reset overrides
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-xs text-gray-700">
              Material Cost / kg
              <input
                type="number"
                min="0.01"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('material_cost_per_kg', Number(selectedMaterial?.cost_per_kg ?? 0))}
                onChange={(e) => applyNumericOverrideInput('material_cost_per_kg', e.target.value)}
                onBlur={() => commitNumericOverrideInput('material_cost_per_kg', Number(selectedMaterial?.cost_per_kg ?? 1), { min: 0.01 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Material Difficulty
              <input
                type="number"
                min="0.5"
                max="3"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('material_machining_difficulty_factor', Number(selectedMaterial?.machining_difficulty_factor ?? 1))}
                onChange={(e) => applyNumericOverrideInput('material_machining_difficulty_factor', e.target.value)}
                onBlur={() => commitNumericOverrideInput('material_machining_difficulty_factor', Number(selectedMaterial?.machining_difficulty_factor ?? 1), { min: 0.5, max: 3 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Material Density (g/cm3)
              <input
                type="number"
                min="0.01"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('material_density', Number(selectedMaterial?.density ?? 1))}
                onChange={(e) => applyNumericOverrideInput('material_density', e.target.value)}
                onBlur={() => commitNumericOverrideInput('material_density', Number(selectedMaterial?.density ?? 1), { min: 0.01 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Scrap Cost / kg
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('scrap_cost_per_kg', 30)}
                onChange={(e) => applyNumericOverrideInput('scrap_cost_per_kg', e.target.value)}
                onBlur={() => commitNumericOverrideInput('scrap_cost_per_kg', 30, { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700 flex items-end">
              <span className="w-full">
                Include Scrap Saving
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (!onPricingOverridesChange) return;
                    onPricingOverridesChange({
                      ...pricingOverrides,
                      include_scrap_saving: !(pricingOverrides.include_scrap_saving ?? true),
                    });
                  }}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-left bg-white hover:bg-gray-50"
                >
                  {(pricingOverrides.include_scrap_saving ?? true) ? 'Enabled' : 'Disabled'}
                </button>
              </span>
            </label>

            <label className="text-xs text-gray-700">
              Machine Hour Rate
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('machine_hourly_rate', Number(selectedMachine?.hourly_rate ?? 700))}
                onChange={(e) => applyNumericOverrideInput('machine_hourly_rate', e.target.value)}
                onBlur={() => commitNumericOverrideInput('machine_hourly_rate', Number(selectedMachine?.hourly_rate ?? 700), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Setup Hour Rate
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('machine_setup_hourly_rate', Number(selectedMachine?.setup_hour_rate ?? selectedMachine?.hourly_rate ?? 700))}
                onChange={(e) => applyNumericOverrideInput('machine_setup_hourly_rate', e.target.value)}
                onBlur={() => commitNumericOverrideInput('machine_setup_hourly_rate', Number(selectedMachine?.setup_hour_rate ?? selectedMachine?.hourly_rate ?? 700), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Setup Time (hours)
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('machine_setup_time_hours', Number(selectedMachine?.setup_time_hours ?? 0.5))}
                onChange={(e) => applyNumericOverrideInput('machine_setup_time_hours', e.target.value)}
                onBlur={() => commitNumericOverrideInput('machine_setup_time_hours', Number(selectedMachine?.setup_time_hours ?? 0.5), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Finish Fixed Cost
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('surface_finish_fixed_cost', Number(selectedFinish?.fixed_cost ?? 0))}
                onChange={(e) => applyNumericOverrideInput('surface_finish_fixed_cost', e.target.value)}
                onBlur={() => commitNumericOverrideInput('surface_finish_fixed_cost', Number(selectedFinish?.fixed_cost ?? 0), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Finish Multiplier
              <input
                type="number"
                min="1"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('surface_finish_cost_multiplier', Number(selectedFinish?.cost_multiplier ?? 1))}
                onChange={(e) => applyNumericOverrideInput('surface_finish_cost_multiplier', e.target.value)}
                onBlur={() => commitNumericOverrideInput('surface_finish_cost_multiplier', Number(selectedFinish?.cost_multiplier ?? 1), { min: 1 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Finish Rate / kg
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('surface_finish_rate_per_kg', Number(selectedFinish?.rate_per_kg ?? 0))}
                onChange={(e) => applyNumericOverrideInput('surface_finish_rate_per_kg', e.target.value)}
                onBlur={() => commitNumericOverrideInput('surface_finish_rate_per_kg', Number(selectedFinish?.rate_per_kg ?? 0), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Finish Rate / sq.in
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('surface_finish_rate_per_sq_inch', Number(selectedFinish?.rate_per_sq_inch ?? 0))}
                onChange={(e) => applyNumericOverrideInput('surface_finish_rate_per_sq_inch', e.target.value)}
                onBlur={() => commitNumericOverrideInput('surface_finish_rate_per_sq_inch', Number(selectedFinish?.rate_per_sq_inch ?? 0), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Finish Rate / sq.ft
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('surface_finish_rate_per_sq_ft', Number(selectedFinish?.rate_per_sq_ft ?? 0))}
                onChange={(e) => applyNumericOverrideInput('surface_finish_rate_per_sq_ft', e.target.value)}
                onBlur={() => commitNumericOverrideInput('surface_finish_rate_per_sq_ft', Number(selectedFinish?.rate_per_sq_ft ?? 0), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Finish Rate / piece
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('surface_finish_rate_per_piece', Number(selectedFinish?.rate_per_piece ?? 0))}
                onChange={(e) => applyNumericOverrideInput('surface_finish_rate_per_piece', e.target.value)}
                onBlur={() => commitNumericOverrideInput('surface_finish_rate_per_piece', Number(selectedFinish?.rate_per_piece ?? 0), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Inspection Fixed Cost
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('inspection_fixed_cost', Number(selectedInspection?.fixed_cost ?? 0))}
                onChange={(e) => applyNumericOverrideInput('inspection_fixed_cost', e.target.value)}
                onBlur={() => commitNumericOverrideInput('inspection_fixed_cost', Number(selectedInspection?.fixed_cost ?? 0), { min: 0 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>

            <label className="text-xs text-gray-700">
              Inspection Percentage
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                disabled={disabled}
                value={getDraftValue('inspection_percentage_cost', Number(selectedInspection?.percentage_cost ?? 0))}
                onChange={(e) => applyNumericOverrideInput('inspection_percentage_cost', e.target.value)}
                onBlur={() => commitNumericOverrideInput('inspection_percentage_cost', Number(selectedInspection?.percentage_cost ?? 0), { min: 0, max: 100 })}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
            </label>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
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
          Setup, programming and tooling costs are shared across the batch — see the quantity
          breaks table in the price panel for unit prices at 1 / 10 / 50 / 100 pcs.
        </p>
      </div>
    </div>
  );
};

export default ConfigurationPanel;
