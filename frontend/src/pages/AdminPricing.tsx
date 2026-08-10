import { useEffect, useState } from 'react';
import { Settings, Save, Loader2, AlertCircle, CheckCircle, ChevronDown, ChevronUp , RotateCcw} from 'lucide-react';
import type { Material, SurfaceFinish, InspectionLevel } from '@/types';
import {
  getMaterials, getSurfaceFinishes, getInspectionLevels,
  updateMaterial, updateSurfaceFinish, updateInspectionLevel,
  resetMaterial, resetSurfaceFinish, resetInspectionLevel, resetMachineRate,
  getMachineRates, updateMachineRate, type MachineRate,
} from '@/services/api';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type PricingTab = 'material' | 'finish' | 'inspection' | 'machining';

interface EditField {
  [id: string]: {
    value: string;
    saveState: SaveState;
    errorMsg?: string;
  };
}

function PricingSection<T extends { id: string; name: string }>({
  title,
  items,
  fieldKey,
  fieldLabel,
  fieldUnit,
  fieldPrefix = '₹',
  onSave,
  onReset,
}: {
  title: string;
  items: T[];
  fieldKey: keyof T;
  fieldLabel: string;
  fieldUnit: string;
  fieldPrefix?: string;
  /** Resolves to the saved row's id, which differs from `id` when editing a
   *  shared default created this workspace's own copy. */
  onSave: (id: string, value: number) => Promise<string | void>;
  /** Omitted for catalogs that cannot be reset (none today). */
  onReset?: (id: string) => Promise<void>;
}) {
  const [edits, setEdits] = useState<EditField>({});
  const [open, setOpen] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);

  const getEdit = (id: string, currentVal: number) => {
    return edits[id]?.value ?? String(currentVal);
  };

  const getSaveState = (id: string): SaveState => edits[id]?.saveState ?? 'idle';

  const handleChange = (id: string, val: string) => {
    setEdits((prev) => ({ ...prev, [id]: { value: val, saveState: 'idle' } }));
  };

  const handleSave = async (id: string) => {
    const raw = edits[id]?.value;
    const num = parseFloat(raw);
    if (isNaN(num) || num < 0) {
      setEdits((prev) => ({ ...prev, [id]: { ...prev[id], saveState: 'error', errorMsg: 'Invalid value' } }));
      return;
    }
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], saveState: 'saving' } }));
    try {
      // Editing a shared default copies it into this workspace, so the saved
      // row can come back with a new id. Re-key the edit state onto it or the
      // confirmation would attach to a row that no longer renders.
      const savedId = (await onSave(id, num)) || id;
      setEdits((prev) => {
        const { [id]: previous, ...rest } = prev;
        return { ...rest, [savedId]: { ...previous, saveState: 'saved' } };
      });
      setTimeout(() => {
        setEdits((prev) => ({ ...prev, [savedId]: { ...prev[savedId], saveState: 'idle' } }));
      }, 2000);
    } catch {
      setEdits((prev) => ({ ...prev, [id]: { ...prev[id], saveState: 'error', errorMsg: 'Save failed' } }));
    }
  };

  const handleReset = async (id: string) => {
    if (!onReset) return;
    setResetting(id);
    try {
      await onReset(id);
      setEdits((prev) => {
        const { [id]: _dropped, ...rest } = prev;
        return rest;
      });
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 sm:px-6 py-4 text-left hover:bg-gray-50"
        onClick={() => setOpen((o) => !o)}
      >
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          <div className="hidden md:grid grid-cols-[1fr_auto_auto] gap-x-4 px-6 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Name</span>
            <span className="text-right w-48">{fieldLabel} ({fieldUnit})</span>
            <span className="w-20" />
          </div>
          {items.map((item) => {
            const currentVal = Number(item[fieldKey]);
            const state = getSaveState(item.id);
            const editVal = getEdit(item.id, currentVal);
            const changed = parseFloat(editVal) !== currentVal;
            // A row owned by this workspace overrides the shared default.
            const customised = Boolean((item as { user_id?: string | null }).user_id);
            return (
              <div
                key={item.id}
                className="px-4 sm:px-6 py-3 border-t border-gray-100"
              >
                <div className="md:grid md:grid-cols-[1fr_auto_auto] md:gap-x-4 md:items-center">
                  <div className="mb-3 md:mb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {customised && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 ring-1 ring-primary-200">
                          Your rate
                        </span>
                      )}
                    </div>
                    {'common_names' in item && (item as { common_names?: string | null }).common_names && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {(item as { common_names?: string | null }).common_names}
                      </p>
                    )}
                    {'description' in item && (item as { description?: string | null }).description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {(item as { description?: string | null }).description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-48">
                    {fieldPrefix ? <span className="text-gray-500 text-sm">{fieldPrefix}</span> : null}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editVal}
                      onChange={(e) => handleChange(item.id, e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div className="mt-3 md:mt-0 md:w-32 flex items-center justify-end gap-2">
                    {customised && onReset && state !== 'saving' && (
                      <button
                        onClick={() => handleReset(item.id)}
                        disabled={resetting === item.id}
                        title="Discard your rate and go back to the standard one"
                        className="flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                      >
                        {resetting === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {state === 'saving' ? (
                      <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                    ) : state === 'saved' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : state === 'error' ? (
                      <span className="text-xs text-red-500">{edits[item.id]?.errorMsg}</span>
                    ) : (
                      <button
                        onClick={() => handleSave(item.id)}
                        disabled={!changed}
                        className="w-full md:w-auto flex items-center justify-center gap-1 px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const AdminPricing = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [finishes, setFinishes] = useState<SurfaceFinish[]>([]);
  const [inspections, setInspections] = useState<InspectionLevel[]>([]);
  const [machineRates, setMachineRates] = useState<MachineRate[]>([]);
  const [activeTab, setActiveTab] = useState<PricingTab>('material');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMaterials(false), getSurfaceFinishes(false), getInspectionLevels(false), getMachineRates()])
      .then(([m, f, i, mr]) => {
        setMaterials(m);
        setFinishes(f);
        setInspections(i);
        setMachineRates(mr);
      })
      .catch(() => setError('Failed to load pricing configuration'))
      .finally(() => setLoading(false));
  }, []);


  // After a reset the shared default reappears under its own id, so the list
  // is refetched rather than patched locally.
  const reloadMaterials = () => getMaterials(false).then(setMaterials);
  const reloadFinishes = () => getSurfaceFinishes(false).then(setFinishes);
  const reloadInspections = () => getInspectionLevels(false).then(setInspections);
  const reloadMachineRates = () => getMachineRates().then(setMachineRates);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 sm:py-20">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 sm:p-6 flex items-center gap-3">
        <AlertCircle className="w-6 h-6 text-red-600" />
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary-600" />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Pricing Configuration</h1>
        </div>
        <p className="text-gray-500 mt-1 text-sm sm:text-base">Customize material costs, surface finish fees, inspection charges, and machine rates. All values in INR (₹).</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-2 flex flex-wrap gap-2">
        {[
          { key: 'material', label: 'Material Rate' },
          { key: 'machining', label: 'Machining Rate' },
          { key: 'finish', label: 'Surface Finish Rate' },
          { key: 'inspection', label: 'Inspection Rate' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as PricingTab)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'material' && (
        <div className="space-y-6">
          <PricingSection
            title="Material Costs (per kg)"
            items={materials}
            fieldKey="cost_per_kg"
            fieldLabel="Cost/kg"
            fieldUnit="₹/kg"
            onSave={(id, value) =>
              updateMaterial(id, { cost_per_kg: value }).then((updated) => {
                setMaterials((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetMaterial(id).then(reloadMaterials)}
          />

          <PricingSection
            title="Material Density"
            items={materials}
            fieldKey="density"
            fieldLabel="Density"
            fieldUnit="g/cm3"
            fieldPrefix=""
            onSave={(id, value) =>
              updateMaterial(id, { density: value }).then((updated) => {
                setMaterials((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetMaterial(id).then(reloadMaterials)}
          />

          <PricingSection
            title="Material Scrap Saving Cost"
            items={materials}
            fieldKey="scrap_cost_per_kg"
            fieldLabel="Scrap Saving"
            fieldUnit="₹/kg"
            onSave={(id, value) =>
              updateMaterial(id, { scrap_cost_per_kg: value }).then((updated) => {
                setMaterials((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetMaterial(id).then(reloadMaterials)}
          />
        </div>
      )}

      {activeTab === 'finish' && (
        <div className="space-y-6">
          <PricingSection
            title="Surface Finish Fixed Costs"
            items={finishes}
            fieldKey="fixed_cost"
            fieldLabel="Fixed Cost"
            fieldUnit="₹"
            onSave={(id, value) =>
              updateSurfaceFinish(id, { fixed_cost: value }).then((updated) => {
                setFinishes((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetSurfaceFinish(id).then(reloadFinishes)}
          />

          <PricingSection
            title="Surface Finish Rate per Kg"
            items={finishes}
            fieldKey="rate_per_kg"
            fieldLabel="Rate"
            fieldUnit="₹/kg"
            onSave={(id, value) =>
              updateSurfaceFinish(id, { rate_per_kg: value }).then((updated) => {
                setFinishes((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetSurfaceFinish(id).then(reloadFinishes)}
          />

          <PricingSection
            title="Surface Finish Rate per sq.in"
            items={finishes}
            fieldKey="rate_per_sq_inch"
            fieldLabel="Rate"
            fieldUnit="₹/sq.in"
            onSave={(id, value) =>
              updateSurfaceFinish(id, { rate_per_sq_inch: value }).then((updated) => {
                setFinishes((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetSurfaceFinish(id).then(reloadFinishes)}
          />

          <PricingSection
            title="Surface Finish Rate per sq.ft"
            items={finishes}
            fieldKey="rate_per_sq_ft"
            fieldLabel="Rate"
            fieldUnit="₹/sq.ft"
            onSave={(id, value) =>
              updateSurfaceFinish(id, { rate_per_sq_ft: value }).then((updated) => {
                setFinishes((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetSurfaceFinish(id).then(reloadFinishes)}
          />

          <PricingSection
            title="Surface Finish Rate per Piece"
            items={finishes}
            fieldKey="rate_per_piece"
            fieldLabel="Rate"
            fieldUnit="₹/piece"
            onSave={(id, value) =>
              updateSurfaceFinish(id, { rate_per_piece: value }).then((updated) => {
                setFinishes((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetSurfaceFinish(id).then(reloadFinishes)}
          />
        </div>
      )}

      {activeTab === 'inspection' && (
        <div className="space-y-6">
          <PricingSection
            title="Inspection Level Fixed Costs"
            items={inspections}
            fieldKey="fixed_cost"
            fieldLabel="Fixed Cost"
            fieldUnit="₹"
            onSave={(id, value) =>
              updateInspectionLevel(id, { fixed_cost: value }).then((updated) => {
                setInspections((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetInspectionLevel(id).then(reloadInspections)}
          />

          <PricingSection
            title="Inspection Percentage Costs"
            items={inspections}
            fieldKey="percentage_cost"
            fieldLabel="Percentage"
            fieldUnit="%"
            fieldPrefix=""
            onSave={(id, value) =>
              updateInspectionLevel(id, { percentage_cost: value }).then((updated) => {
                setInspections((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetInspectionLevel(id).then(reloadInspections)}
          />
        </div>
      )}

      {activeTab === 'machining' && (
        <div className="space-y-6">
          <PricingSection
            title="Machine Hourly Rates"
            items={machineRates}
            fieldKey="hourly_rate"
            fieldLabel="Hourly Rate"
            fieldUnit="₹/hr"
            onSave={(id, value) =>
              updateMachineRate(id, { hourly_rate: value }).then((updated) => {
                setMachineRates((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetMachineRate(id).then(reloadMachineRates)}
          />

          <PricingSection
            title="Machine Setup Hour Rates"
            items={machineRates}
            fieldKey="setup_hour_rate"
            fieldLabel="Setup Hour"
            fieldUnit="₹/hr"
            onSave={(id, value) =>
              updateMachineRate(id, { setup_hour_rate: value }).then((updated) => {
                setMachineRates((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetMachineRate(id).then(reloadMachineRates)}
          />

          <PricingSection
            title="Machine Setup Time"
            items={machineRates}
            fieldKey="setup_time_hours"
            fieldLabel="Setup Time"
            fieldUnit="hours"
            fieldPrefix=""
            onSave={(id, value) =>
              updateMachineRate(id, { setup_time_hours: value }).then((updated) => {
                setMachineRates((prev) => prev.map((row) => (row.id === id ? updated : row)));
                return updated.id;
              })
            }
            onReset={(id) => resetMachineRate(id).then(reloadMachineRates)}
          />
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> Changes take effect immediately for new quotes. Existing quotes retain their original pricing.
        </p>
      </div>
    </div>
  );
};

export default AdminPricing;
