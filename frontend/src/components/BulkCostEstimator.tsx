import { useState, useEffect, useRef } from 'react';
import { downloadBulkReportPDF, getInstantPricing } from '@/services/api';
import type { BulkFileEntry } from './BulkUploadManager';
import { AlertCircle, Package, ChevronDown, ChevronUp, Eye, Download, Mail, Send } from 'lucide-react';

interface BulkCostEstimatorProps {
  entries: BulkFileEntry[];
  onPreviewFile?: (entry: BulkFileEntry) => void;
}

interface PerFilePricingDetail {
  id: string;
  entry: BulkFileEntry;
  filename: string;
  materialName: string;
  surfaceFinishName: string;
  inspectionLevelName: string;
  quantity: number;
  volume: number;
  complexity: number;
  leadTimeDays: number;
  totalPrice: number;
  unitPrice: number;
  materialCost: number;
  machiningCost: number;
  finishCost: number;
  inspectionCost: number;
}

interface AggregatedStats {
  totalCost: number;
  totalMaterialCost: number;
  totalMachiningCost: number;
  totalFinishCost: number;
  totalInspectionCost: number;
  maxLeadTime: number;
  averageLeadTime: number;
  fileCount: number;
  perFileDetails: PerFilePricingDetail[];
}

const BulkCostEstimator = ({ entries, onPreviewFile }: BulkCostEstimatorProps) => {
  const [stats, setStats] = useState<AggregatedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const pricingRequestVersion = useRef(0);

  useEffect(() => {
    const fetchPricing = async () => {
      const requestVersion = ++pricingRequestVersion.current;
      try {
        setLoading(true);
        setError(null);
        setWarning(null);

        const pricedEntries = entries.filter((e) => e.geometry && e.config && e.cadFile);

        const pricingRequests = pricedEntries.map((e) => ({
          cad_file_id: e.cadFile!.id,
          material_id: e.config!.material_id,
          surface_finish_id: e.config!.surface_finish_id,
          inspection_level_id: e.config!.inspection_level_id,
          quantity: e.config!.quantity,
          pricing_overrides: e.config!.pricing_overrides,
        }));

        if (pricingRequests.length === 0) {
          setStats(null);
          return;
        }

        const pricingResults = await Promise.allSettled(
          pricingRequests.map((request) => getInstantPricing(request))
        );

        if (pricingRequestVersion.current !== requestVersion) {
          return;
        }

        let totalCost = 0;
        let totalMaterialCost = 0;
        let totalMachiningCost = 0;
        let totalFinishCost = 0;
        let totalInspectionCost = 0;
        let totalLeadTime = 0;
        let maxLeadTime = 0;
        let failedCount = 0;

        const perFileDetails: PerFilePricingDetail[] = [];

        pricingResults.forEach((result, index) => {
          const entry = pricedEntries[index];
          if (result.status !== 'fulfilled') {
            failedCount += 1;
            return;
          }

          const pricing = result.value;

          const quantity = pricing.quantity || entry.config!.quantity || 1;
          const cost = Number(pricing.price_breakdown.total_price);
          const materialCost = Number(pricing.price_breakdown.material_cost) * quantity;
          const machiningCost = Number(pricing.price_breakdown.machining_cost) * quantity;
          const finishCost = Number(pricing.price_breakdown.finish_cost) * quantity;
          const inspectionCost = Number(pricing.price_breakdown.inspection_cost) * quantity;

          totalCost += cost;
          totalMaterialCost += materialCost;
          totalMachiningCost += machiningCost;
          totalFinishCost += finishCost;
          totalInspectionCost += inspectionCost;
          totalLeadTime += pricing.estimated_lead_time_days;
          maxLeadTime = Math.max(maxLeadTime, pricing.estimated_lead_time_days);

          perFileDetails.push({
            id: entry.id,
            entry,
            filename: entry.filename,
            materialName: pricing.material.name,
            surfaceFinishName: pricing.surface_finish.name,
            inspectionLevelName: pricing.inspection_level.name,
            quantity,
            volume: entry.geometry!.volume,
            complexity: pricing.complexity_score,
            leadTimeDays: pricing.estimated_lead_time_days,
            totalPrice: cost,
            unitPrice: Number(pricing.price_breakdown.unit_price),
            materialCost,
            machiningCost,
            finishCost,
            inspectionCost,
          });
        });

        const fileCount = perFileDetails.length;

        if (fileCount === 0) {
          setStats(null);
          setError('Unable to calculate pricing for configured files. Please verify selected options.');
          return;
        }

        if (failedCount > 0) {
          setWarning(`Pricing unavailable for ${failedCount} file${failedCount === 1 ? '' : 's'}. Totals shown for ${fileCount} file${fileCount === 1 ? '' : 's'}.`);
        }

        setStats({
          totalCost,
          totalMaterialCost,
          totalMachiningCost,
          totalFinishCost,
          totalInspectionCost,
          maxLeadTime,
          averageLeadTime: totalLeadTime / fileCount,
          fileCount,
          perFileDetails,
        });
      } catch (err) {
        if (pricingRequestVersion.current !== requestVersion) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to calculate pricing');
      } finally {
        if (pricingRequestVersion.current === requestVersion) {
          setLoading(false);
        }
      }
    };

    fetchPricing();
  }, [entries]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(value);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toFixed(decimals);
  };

  const downloadPdfReport = async () => {
    if (!stats) return;
    try {
      const blob = await downloadBulkReportPDF({
        report_title: 'Bulk Quote Summary',
        currency: 'INR',
        total_cost: Number(stats.totalCost.toFixed(2)),
        file_count: stats.fileCount,
        max_lead_time_days: Number(stats.maxLeadTime.toFixed(1)),
        items: stats.perFileDetails.map((file) => ({
          filename: file.filename,
          quantity: file.quantity,
          material_name: file.materialName,
          surface_finish_name: file.surfaceFinishName,
          inspection_level_name: file.inspectionLevelName,
          lead_time_days: Number(file.leadTimeDays.toFixed(1)),
          unit_price: Number(file.unitPrice.toFixed(2)),
          line_total: Number(file.totalPrice.toFixed(2)),
        })),
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `bulk-quote-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF report');
    }
  };

  const handleSendEmail = () => {
    if (!stats) return;
    if (!emailTo.trim()) {
      return;
    }

    const perFileLines = stats.perFileDetails.map((file) => {
      return `- ${file.filename} | Qty ${file.quantity} | ${file.materialName} | ${file.surfaceFinishName} | ${file.inspectionLevelName} | ${formatCurrency(file.totalPrice)} | ${formatNumber(file.leadTimeDays, 1)} days`;
    });

    const body = [
      emailMessage.trim(),
      emailMessage.trim() ? '' : undefined,
      'Bulk Quote Summary',
      `Total Files: ${stats.fileCount}`,
      `Total Cost: ${formatCurrency(stats.totalCost)}`,
      `Estimated Batch Lead Time: up to ${formatNumber(stats.maxLeadTime, 1)} days`,
      '',
      'Per-file details:',
      ...perFileLines,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    const mailto = `mailto:${encodeURIComponent(emailTo.trim())}?subject=${encodeURIComponent(emailSubject.trim() || `Bulk Quote Report - ${stats.fileCount} Files`)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const hasEmailTo = emailTo.trim().length > 0;

  useEffect(() => {
    if (!stats) {
      return;
    }
    setEmailSubject(`Bulk Quote Report - ${stats.fileCount} Files`);
  }, [stats]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-8 text-center border border-gray-200">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="text-gray-600 mt-4">Calculating costs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-red-900">Error calculating costs</h3>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats || stats.fileCount === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
          {warning}
        </div>
      )}

      {/* Header with Total Cost */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-lg p-6 sm:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-blue-100 text-sm font-medium">Total Batch Cost</p>
            <p className="text-3xl sm:text-4xl font-bold mt-2">{formatCurrency(stats.totalCost)}</p>
            <p className="text-blue-100 text-sm mt-2">{stats.fileCount} files</p>
          </div>
          <div className="flex items-end justify-start sm:justify-end">
            <div>
              <p className="text-blue-100 text-sm font-medium">Average per File</p>
              <p className="text-2xl font-semibold">{formatCurrency(stats.totalCost / stats.fileCount)}</p>
              <p className="text-blue-100 text-sm mt-1">Avg lead time: {formatNumber(stats.averageLeadTime, 1)} days</p>
              <p className="text-blue-100 text-xs mt-0.5">Batch completion estimate: up to {formatNumber(stats.maxLeadTime, 1)} days</p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => void downloadPdfReport()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Download PDF Report
          </button>
          <button
            onClick={() => setShowEmailPanel((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium"
          >
            <Mail className="w-4 h-4" />
            {showEmailPanel ? 'Hide Email' : 'Email Report'}
          </button>
        </div>
      </div>

      {showEmailPanel && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Email Bulk Report</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm text-gray-700">
              Recipient Email
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="customer@company.com"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </label>
            <label className="text-sm text-gray-700">
              Subject
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </label>
          </div>
          <label className="text-sm text-gray-700 block">
            Message (optional)
            <textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={4}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Add any comments to include in the report email"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSendEmail}
              disabled={!hasEmailTo}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm font-medium"
            >
              <Send className="w-4 h-4" />
              Open Email Draft
            </button>
          </div>
        </div>
      )}

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Material Cost</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats.totalMaterialCost)}</p>
            </div>
            <div className="text-blue-500 text-xl">📦</div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Machining Cost</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats.totalMachiningCost)}</p>
            </div>
            <div className="text-orange-500 text-xl">⚙️</div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Finish Cost</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats.totalFinishCost)}</p>
            </div>
            <div className="text-purple-500 text-xl">🎨</div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Inspection Cost</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats.totalInspectionCost)}</p>
            </div>
            <div className="text-green-500 text-xl">✓</div>
          </div>
        </div>
      </div>

      {/* Bulk-only detailed breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Detailed Pricing Breakdown (Bulk)</h3>
          <p className="text-sm text-gray-500 mt-1">Component totals across all configured files.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Cost Component</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-3 text-gray-700">Material</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(stats.totalMaterialCost)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-gray-700">Machining</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(stats.totalMachiningCost)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-gray-700">Surface Finish</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(stats.totalFinishCost)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-gray-700">Inspection</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(stats.totalInspectionCost)}</td>
              </tr>
              <tr className="bg-blue-50">
                <td className="px-4 py-3 font-semibold text-blue-900">Grand Total</td>
                <td className="px-4 py-3 text-right font-bold text-blue-900">{formatCurrency(stats.totalCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-File Details */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-400" />
            Per-File Details ({stats.fileCount} files)
          </h3>
        </div>
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {stats.perFileDetails.map((file) => {
              const isExpanded = expandedFiles.has(file.id);
              return (
                <div key={file.id}>
                  <button
                    onClick={() => {
                      const newExpanded = new Set(expandedFiles);
                      if (newExpanded.has(file.id)) {
                        newExpanded.delete(file.id);
                      } else {
                        newExpanded.add(file.id);
                      }
                      setExpandedFiles(newExpanded);
                    }}
                    className="w-full p-4 sm:p-6 flex items-start justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-medium text-gray-900 break-words">{file.filename}</p>
                      <div className="flex flex-col sm:flex-row gap-2 mt-2 text-sm text-gray-500">
                        <span>{file.volume.toFixed(1)} cm³</span>
                        <span className="hidden sm:inline text-gray-300">•</span>
                        <span>{formatNumber(file.complexity, 1)} complexity</span>
                        <span className="hidden sm:inline text-gray-300">•</span>
                        <span>Qty: {file.quantity}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(file.totalPrice)}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatCurrency(file.unitPrice)}/unit</p>
                      {isExpanded ? <ChevronUp className="w-5 h-5 mt-1" /> : <ChevronDown className="w-5 h-5 mt-1" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 sm:px-6 pb-4 sm:pb-6 bg-gray-50 border-t border-gray-200 space-y-3">
                      {onPreviewFile && file.entry.cadFile && (
                        <button
                          onClick={() => onPreviewFile(file.entry)}
                          className="px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded border border-blue-200 flex items-center gap-1 whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View 3D</span>
                        </button>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-600">Material</p>
                          <p className="font-semibold text-gray-900">{formatCurrency(file.materialCost)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Machining</p>
                          <p className="font-semibold text-gray-900">{formatCurrency(file.machiningCost)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Finish</p>
                          <p className="font-semibold text-gray-900">{formatCurrency(file.finishCost)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Inspection</p>
                          <p className="font-semibold text-gray-900">{formatCurrency(file.inspectionCost)}</p>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-gray-200 text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-600">Line Total</span>
                          <span className="font-semibold text-gray-900">{formatCurrency(file.totalPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Lead Time</span>
                          <span className="font-semibold text-gray-900">{file.leadTimeDays} days</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default BulkCostEstimator;
