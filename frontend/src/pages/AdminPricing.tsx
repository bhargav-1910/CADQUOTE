import { useEffect, useState } from 'react';
import { Settings, Save, Loader2, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { Material, SurfaceFinish, InspectionLevel } from '@/types';
import {
  getMaterials, getSurfaceFinishes, getInspectionLevels,
  updateMaterial, updateSurfaceFinish, updateInspectionLevel,
  getMachineRates, updateMachineRate, type MachineRate,
} from '@/services/api';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

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
  onSave,
}: {
  title: string;
  items: T[];
  fieldKey: keyof T;
  fieldLabel: string;
  fieldUnit: string;
  onSave: (id: string, value: number) => Promise<void>;
}) {
  const [edits, setEdits] = useState<EditField>({});
  const [open, setOpen] = useState(true);

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
      await onSave(id, num);
      setEdits((prev) => ({ ...prev, [id]: { ...prev[id], saveState: 'saved' } }));
      setTimeout(() => {
        setEdits((prev) => ({ ...prev, [id]: { ...prev[id], saveState: 'idle' } }));
      }, 2000);
    } catch {
      setEdits((prev) => ({ ...prev, [id]: { ...prev[id], saveState: 'error', errorMsg: 'Save failed' } }));
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
        onClick={() => setOpen((o) => !o)}
      >
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-6 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Name</span>
            <span className="text-right w-48">{fieldLabel} ({fieldUnit})</span>
            <span className="w-20" />
          </div>
          {items.map((item) => {
            const currentVal = Number(item[fieldKey]);
            const state = getSaveState(item.id);
            const editVal = getEdit(item.id, currentVal);
            const changed = parseFloat(editVal) !== currentVal;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-6 py-3 border-t border-gray-100"
              >
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  {'description' in item && (item as { description?: string | null }).description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {(item as { description?: string | null }).description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 w-48">
                  <span className="text-gray-500 text-sm">₹</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editVal}
                    onChange={(e) => handleChange(item.id, e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div className="w-20 flex justify-end">
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
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save
                    </button>
                  )}
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-center gap-3">
        <AlertCircle className="w-6 h-6 text-red-600" />
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Pricing Configuration</h1>
        </div>
        <p className="text-gray-500 mt-1">Customize material costs, surface finish fees, inspection charges, and machine rates. All values in INR (₹).</p>
      </div>

      <PricingSection
        title="Material Costs (per kg)"
        items={materials}
        fieldKey="cost_per_kg"
        fieldLabel="Cost/kg"
        fieldUnit="₹/kg"
        onSave={(id, value) =>
          updateMaterial(id, { cost_per_kg: value }).then((updated) =>
            setMaterials((prev) => prev.map((m) => (m.id === id ? updated : m)))
          )
        }
      />

      <PricingSection
        title="Surface Finish Fixed Costs"
        items={finishes}
        fieldKey="fixed_cost"
        fieldLabel="Fixed Cost"
        fieldUnit="₹"
        onSave={(id, value) =>
          updateSurfaceFinish(id, { fixed_cost: value }).then((updated) =>
            setFinishes((prev) => prev.map((f) => (f.id === id ? updated : f)))
          )
        }
      />

      <PricingSection
        title="Inspection Level Fixed Costs"
        items={inspections}
        fieldKey="fixed_cost"
        fieldLabel="Fixed Cost"
        fieldUnit="₹"
        onSave={(id, value) =>
          updateInspectionLevel(id, { fixed_cost: value }).then((updated) =>
            setInspections((prev) => prev.map((i) => (i.id === id ? updated : i)))
          )
        }
      />

      <PricingSection
        title="Machine Hourly Rates"
        items={machineRates}
        fieldKey="hourly_rate"
        fieldLabel="Hourly Rate"
        fieldUnit="₹/hr"
        onSave={(id, value) =>
          updateMachineRate(id, { hourly_rate: value }).then((updated) =>
            setMachineRates((prev) => prev.map((r) => (r.id === id ? updated : r)))
          )
        }
      />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> Changes take effect immediately for new quotes. Existing quotes retain their original pricing.
        </p>
      </div>
    </div>
  );
};

export default AdminPricing;
