import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getMaterials, getSurfaceFinishes, getInspectionLevels } from '@/services/api';
import type { Material, SurfaceFinish, InspectionLevel } from '@/types';

interface BatchConfig {
  material_id: string;
  surface_finish_id: string;
  inspection_level_id: string;
  quantity: number;
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
            {/* Material */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Material</label>
              <select
                value={config.material_id}
                onChange={(e) => setConfig({ ...config, material_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a material</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Surface Finish */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Surface Finish
              </label>
              <select
                value={config.surface_finish_id}
                onChange={(e) => setConfig({ ...config, surface_finish_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a finish</option>
                {finishes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Inspection Level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Inspection Level
              </label>
              <select
                value={config.inspection_level_id}
                onChange={(e) => setConfig({ ...config, inspection_level_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select inspection level</option>
                {inspectionLevels.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
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
                onClick={() => onApply(config)}
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
