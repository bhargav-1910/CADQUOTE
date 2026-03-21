import { useState } from 'react';
import { X } from 'lucide-react';
import type { PricingOverrides } from '@/types';
import ConfigurationPanel from '@/components/ConfigurationPanel';

export interface BatchConfig {
  material_id: string;
  surface_finish_id: string;
  inspection_level_id: string;
  quantity: number;
  pricing_overrides?: PricingOverrides;
}

interface BatchConfigPanelProps {
  onClose: () => void;
  onApply: (config: BatchConfig) => void;
  selectedCount?: number;
  initialConfig?: Partial<BatchConfig>;
  panelTitle?: string;
  applyButtonLabel?: string;
  targetDescription?: string;
}

const BatchConfigPanel = ({
  onClose,
  onApply,
  selectedCount,
  initialConfig,
  panelTitle,
  applyButtonLabel,
  targetDescription,
}: BatchConfigPanelProps) => {
  const [config, setConfig] = useState<BatchConfig>({
    material_id: initialConfig?.material_id ?? '',
    surface_finish_id: initialConfig?.surface_finish_id ?? '',
    inspection_level_id: initialConfig?.inspection_level_id ?? '',
    quantity: initialConfig?.quantity ?? 1,
    pricing_overrides: initialConfig?.pricing_overrides,
  });
  const [quoteSpecificPricingEnabled, setQuoteSpecificPricingEnabled] = useState(
    Boolean(initialConfig?.pricing_overrides)
  );

  const isValid =
    config.material_id &&
    config.surface_finish_id &&
    config.inspection_level_id &&
    config.quantity > 0;

  const handleApply = () => {
    onApply({
      ...config,
      pricing_overrides: quoteSpecificPricingEnabled ? config.pricing_overrides : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{panelTitle ?? 'Batch Configuration'}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {targetDescription ?? `Apply configuration to ${selectedCount ?? 1} selected file${(selectedCount ?? 1) !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6 max-h-[68vh] overflow-y-auto">
          <ConfigurationPanel
            materialId={config.material_id || null}
            surfaceFinishId={config.surface_finish_id || null}
            inspectionLevelId={config.inspection_level_id || null}
            quantity={config.quantity}
            quoteSpecificPricingEnabled={quoteSpecificPricingEnabled}
            onQuoteSpecificPricingEnabledChange={(enabled: boolean) => {
              setQuoteSpecificPricingEnabled(enabled);
              if (!enabled) {
                setConfig((prev) => ({ ...prev, pricing_overrides: undefined }));
              }
            }}
            pricingOverrides={config.pricing_overrides ?? {}}
            onPricingOverridesChange={(overrides: PricingOverrides) =>
              setConfig((prev) => ({ ...prev, pricing_overrides: overrides }))
            }
            onMaterialChange={(id: string) => setConfig((prev) => ({ ...prev, material_id: id }))}
            onSurfaceFinishChange={(id: string) => setConfig((prev) => ({ ...prev, surface_finish_id: id }))}
            onInspectionLevelChange={(id: string) => setConfig((prev) => ({ ...prev, inspection_level_id: id }))}
            onQuantityChange={(qty: number) => setConfig((prev) => ({ ...prev, quantity: qty }))}
          />
        </div>

        <div className="flex gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!isValid}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            {applyButtonLabel ?? 'Apply to Selected'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchConfigPanel;
