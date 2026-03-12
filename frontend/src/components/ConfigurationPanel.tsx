import { useEffect, useState } from 'react';
import { Box, Palette, ClipboardCheck, Loader2, Minus, Plus, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Material, SurfaceFinish, InspectionLevel } from '@/types';
import { getMaterials, getSurfaceFinishes, getInspectionLevels } from '@/services/api';

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

interface ConfigurationPanelProps {
  materialId: string | null;
  surfaceFinishId: string | null;
  inspectionLevelId: string | null;
  quantity: number;
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
                {mats.map((mat) => (
                  <button
                    key={mat.id}
                    onClick={() => onMaterialChange(mat.id)}
                    disabled={disabled}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      materialId === mat.id
                        ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <p className="font-medium text-gray-900 text-sm">{mat.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatINR(Number(mat.cost_per_kg))}/kg • {mat.density} g/cm³
                    </p>
                  </button>
                ))}
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
          {finishes.map((finish) => (
            <button
              key={finish.id}
              onClick={() => onSurfaceFinishChange(finish.id)}
              disabled={disabled}
              className={`text-left p-3 rounded-lg border transition-all ${
                surfaceFinishId === finish.id
                  ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          ))}
        </div>
      </div>

      {/* Inspection Level Selection */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
          <ClipboardCheck className="w-4 h-4" />
          Inspection Level
        </label>
        <div className="space-y-2">
          {inspections.map((inspection) => (
            <button
              key={inspection.id}
              onClick={() => onInspectionLevelChange(inspection.id)}
              disabled={disabled}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                inspectionLevelId === inspection.id
                  ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          ))}
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
