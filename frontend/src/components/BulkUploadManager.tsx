import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Upload, Trash2, Play, Pause, AlertCircle, CheckCircle, Clock, Eye, AlertTriangle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import type { CADFile, GeometryAnalysis, PricingResponse, PricingOverrides } from '@/types';
import { uploadCADFile } from '@/services/api';
import { pollForGeometry } from '@/services/uploadWorkflow';
import BatchConfigPanel, { type BatchConfig } from './BatchConfigPanel';
import BulkCostEstimator from './BulkCostEstimator';
import FilePreviewModal from './FilePreviewModal';

export interface BulkFileEntry {
  id: string;
  file: File;
  filename: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'processing' | 'configured' | 'done' | 'error';
  progress: number;
  errorMsg?: string;
  cadFile?: CADFile;
  geometry?: GeometryAnalysis;
  pricing?: PricingResponse;
  
  config?: {
    material_id: string;
    surface_finish_id: string;
    inspection_level_id: string;
    quantity: number;
    pricing_overrides?: PricingOverrides;
  };
}

interface BulkUploadManagerProps {
  onBulkFilesReady?: (files: BulkFileEntry[]) => void;
}

const BulkUploadManager = ({ onBulkFilesReady }: BulkUploadManagerProps) => {
  const [entries, setEntries] = useState<BulkFileEntry[]>([]);
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const [showBatchConfig, setShowBatchConfig] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<BulkFileEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [singleConfigEntryId, setSingleConfigEntryId] = useState<string | null>(null);
  const estimatorSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onBulkFilesReady?.(entries);
  }, [entries, onBulkFilesReady]);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(entries.map((e) => e.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const updateEntry = (id: string, patch: Partial<BulkFileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFileEntry = async (entry: BulkFileEntry) => {
    try {
      updateEntry(entry.id, { status: 'uploading', progress: 20 });
      const uploadedFile = await uploadCADFile(entry.file);

      updateEntry(entry.id, { cadFile: uploadedFile, progress: 40 });

      updateEntry(entry.id, { status: 'processing', progress: 60 });
      const geometry = await pollForGeometry(uploadedFile.id);

      updateEntry(entry.id, {
        geometry,
        status: 'done',
        progress: 100,
      });
    } catch (err) {
      updateEntry(entry.id, {
        status: 'error',
        errorMsg: err instanceof Error ? err.message : 'Processing failed',
        progress: 0,
      });
    }
  };

  const processQueue = useCallback(async () => {
    const pendingEntries = entries.filter(
      (e) => e.status === 'pending' || ((e.status === 'configured' || e.status === 'done') && (!e.cadFile || !e.geometry))
    );

    if (pendingEntries.length === 0) return;

    const queue = [...pendingEntries];
    let activeCount = 0;
    let queueIndex = 0;

    const processNext = async () => {
      if (isPaused || queueIndex >= queue.length) return;

      const entry = queue[queueIndex];
      queueIndex += 1;
      activeCount += 1;

      await processFileEntry(entry);

      activeCount -= 1;
      if (queueIndex < queue.length && activeCount < maxConcurrent) {
        await processNext();
      }
    };

    while (activeCount < maxConcurrent && queueIndex < queue.length) {
      await processNext();
    }

    while (queueIndex < queue.length || activeCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!isPaused && activeCount < maxConcurrent && queueIndex < queue.length) {
        await processNext();
      }
    }
  }, [entries, maxConcurrent, isPaused]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newEntries: BulkFileEntry[] = acceptedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      filename: file.name,
      fileSize: file.size,
      status: 'pending' as const,
      progress: 0,
    }));

    setEntries((prev) => [...prev, ...newEntries]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'model/step': ['.step', '.stp'],
      'model/stl': ['.stl'],
      'application/octet-stream': ['.step', '.stp', '.stl'],
    },
    maxSize: 100 * 1024 * 1024,
  });

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const stats = useMemo(() => {
    const readyCount = entries.filter(
      (e) => (e.status === 'done' || e.status === 'configured') && e.cadFile && e.geometry
    ).length;

    return {
      total: entries.length,
      pending: entries.filter((e) => e.status === 'pending').length,
      uploading: entries.filter((e) => e.status === 'uploading').length,
      processing: entries.filter((e) => e.status === 'processing').length,
      done: readyCount,
      errors: entries.filter((e) => e.status === 'error').length,
    };
  }, [entries]);

  const hasInFlight = stats.uploading > 0 || stats.processing > 0;
  const configuredEntries = entries.filter((e) => e.cadFile && e.geometry && e.config);
  const configuredButUnprocessedEntries = entries.filter(
    (e) => e.config && (!e.cadFile || !e.geometry)
  );
  const singleConfigEntry = singleConfigEntryId ? entries.find((e) => e.id === singleConfigEntryId) ?? null : null;
  const readyEntries = entries.filter((e) => (e.status === 'done' || e.status === 'configured') && e.cadFile && e.geometry);
  const pendingEntries = entries.filter(
    (e) => e.status === 'pending' || ((e.status === 'configured' || e.status === 'done') && (!e.cadFile || !e.geometry))
  );

  const applyConfigurationToEntry = (id: string, config: BatchConfig) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        const isReady = Boolean(entry.cadFile && entry.geometry);
        return {
          ...entry,
          config,
          status: isReady ? 'configured' : 'pending',
        };
      })
    );
  };

  const getStatusIcon = (status: BulkFileEntry['status']) => {
    switch (status) {
      case 'done':
      case 'configured':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'uploading':
      case 'processing':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Upload className="w-5 h-5 text-gray-400" />;
    }
  };

  const getDFXSeverity = (entry: BulkFileEntry): 'error' | 'warning' | 'info' | 'ok' => {
    if (!entry.geometry) return 'info';
    
    const g = entry.geometry;
    if (g.min_wall_thickness && g.min_wall_thickness < 1.5) return 'error';
    if (g.min_wall_thickness && g.min_wall_thickness < 2.0) return 'warning';
    if (g.complexity_score > 5) return 'warning';
    if (g.removal_ratio < 0.3) return 'warning';
    return 'ok';
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Bulk Upload & Pricing</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">Upload multiple CAD files and preview each one in 3D while estimating costs</p>
          </div>
          {entries.length > 0 && (
            <div className="text-xs sm:text-sm text-gray-500">
              {configuredEntries.length} configured of {entries.length}
            </div>
          )}
        </div>

        {/* Upload Area */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-6 sm:p-12 text-center cursor-pointer transition-all ${ isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 sm:w-12 h-8 sm:h-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
          <p className="text-base sm:text-lg font-semibold text-gray-700">
            {isDragActive ? 'Drop files here' : 'Drag files here or click to browse'}
          </p>
          <p className="text-xs sm:text-sm text-gray-500 mt-2">Supports .step, .stp, .stl (max 100 MB each)</p>
        </div>

        {/* Stats Bar */}
        {entries.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 sm:p-6 border border-blue-200">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 text-center">
              <div>
                <div className="text-xl sm:text-2xl font-bold text-gray-700">{stats.total}</div>
                <div className="text-xs text-gray-600 mt-1">Total</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-gray-400">{stats.pending}</div>
                <div className="text-xs text-gray-600 mt-1">Pending</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats.uploading + stats.processing}</div>
                <div className="text-xs text-gray-600 mt-1">In Progress</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.done}</div>
                <div className="text-xs text-gray-600 mt-1">Ready</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-red-600">{stats.errors}</div>
                <div className="text-xs text-gray-600 mt-1">Errors</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-orange-600">
                  {Math.round((stats.done / (stats.total || 1)) * 100)}%
                </div>
                <div className="text-xs text-gray-600 mt-1">Complete</div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        {entries.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4 sm:space-y-0">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-600">
              <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full">
                {pendingEntries.length} pending process
              </span>
              <span className="px-2.5 py-1 bg-green-50 border border-green-200 rounded-full">
                {configuredEntries.length} ready for pricing/report
              </span>
              <button
                onClick={() => estimatorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                disabled={configuredEntries.length === 0}
                className="px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                Go to Pricing & Reports
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center">
              <button
                onClick={() => processQueue()}
                disabled={hasInFlight || pendingEntries.length === 0}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium text-sm"
              >
                {hasInFlight ? 'Processing Files...' : `Process Files (${pendingEntries.length})`}
              </button>

              <button
                onClick={() => setIsPaused(!isPaused)}
                disabled={!hasInFlight}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 font-medium text-sm flex items-center justify-center gap-2"
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>

              <div className="w-full sm:w-auto flex items-center gap-2 flex-wrap">
                <label className="text-sm text-gray-600 whitespace-nowrap">Max concurrent:</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxConcurrent}
                  onChange={(e) => setMaxConcurrent(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={hasInFlight}
                  className="w-20 px-2 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {selectedIds.size > 0 && (
                <>
                  <button
                    onClick={() => setShowBatchConfig(true)}
                    className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
                  >
                    Configure Selected ({selectedIds.size})
                  </button>
                  <button
                    onClick={() => deselectAll()}
                    className="w-full sm:w-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
                  >
                    Deselect
                  </button>
                </>
              )}

              {selectedIds.size === 0 && entries.length > 0 && (
                <>
                  <button
                    onClick={() => selectAll()}
                    className="w-full sm:w-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set(readyEntries.map((entry) => entry.id)))}
                    disabled={readyEntries.length === 0}
                    className="w-full sm:w-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg disabled:opacity-50"
                  >
                    Select Ready ({readyEntries.length})
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Files List */}
        {entries.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {entries.map((entry) => {
                const dfxSeverity = getDFXSeverity(entry);
                return (
                  <div key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <div className="p-4 sm:p-6">
                      <div className="flex items-start gap-3 flex-col sm:flex-row">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={() => toggleSelection(entry.id)}
                          className="w-4 h-4"
                        />
                        {getStatusIcon(entry.status)}

                        <div className="flex-1 min-w-0 w-full">
                          <p className="font-medium text-gray-900 break-words text-sm sm:text-base">{entry.filename}</p>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-2 text-xs sm:text-sm text-gray-500">
                            <span>{formatFileSize(entry.fileSize)}</span>
                            {entry.geometry && (
                              <>
                                <span className="hidden sm:inline text-gray-300">•</span>
                                <span>{entry.geometry.volume.toFixed(1)} cm³</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right Actions */}
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          {/* DFX Indicator */}
                          {entry.geometry && dfxSeverity !== 'ok' && (
                            <>
                              {dfxSeverity === 'error' && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs">
                                  <AlertCircle className="w-3 h-3 text-red-600" />
                                  <span className="font-medium text-red-700">Error</span>
                                </div>
                              )}
                              {dfxSeverity === 'warning' && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs">
                                  <AlertTriangle className="w-3 h-3 text-yellow-600" />
                                  <span className="font-medium text-yellow-700">Warn</span>
                                </div>
                              )}
                            </>
                          )}

                          {/* Preview Button */}
                          {entry.cadFile && (
                            <button
                              onClick={() => setPreviewEntry(entry)}
                              className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded border border-blue-200 flex items-center gap-1 whitespace-nowrap"
                            >
                              <Eye className="w-3 h-3" />
                              <span className="hidden sm:inline">3D Preview</span>
                            </button>
                          )}

                          {(entry.status === 'done' || entry.status === 'configured') && (
                            <button
                              onClick={() => setSingleConfigEntryId(entry.id)}
                              className="px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 rounded border border-green-200 whitespace-nowrap"
                            >
                              {entry.config ? 'Edit Config' : 'Configure'}
                            </button>
                          )}

                          {/* Remove Button */}
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="text-gray-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {entry.progress > 0 && entry.progress < 100 && (
                        <div className="mt-3 sm:mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${entry.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Error Message */}
                      {entry.errorMsg && (
                        <div className="text-xs text-red-600 mt-2">{entry.errorMsg}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Batch Config Panel */}
        {showBatchConfig && selectedIds.size > 0 && (
          <BatchConfigPanel
            onClose={() => setShowBatchConfig(false)}
            onApply={(config) => {
              selectedIds.forEach((id) => {
                applyConfigurationToEntry(id, config);
              });
              setShowBatchConfig(false);
            }}
            selectedCount={selectedIds.size}
            panelTitle="Batch Configuration"
            targetDescription={`Apply configuration to ${selectedIds.size} selected file${selectedIds.size !== 1 ? 's' : ''}`}
            applyButtonLabel="Apply to Selected"
          />
        )}

        {singleConfigEntry && (
          <BatchConfigPanel
            onClose={() => setSingleConfigEntryId(null)}
            onApply={(config) => {
              applyConfigurationToEntry(singleConfigEntry.id, config);
              setSingleConfigEntryId(null);
            }}
            selectedCount={1}
            initialConfig={singleConfigEntry.config}
            panelTitle="Configure File"
            targetDescription={`Set configuration for ${singleConfigEntry.filename}`}
            applyButtonLabel="Apply to File"
          />
        )}

        {/* Cost Estimator */}
        {configuredButUnprocessedEntries.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
            {configuredButUnprocessedEntries.length} configured file{configuredButUnprocessedEntries.length === 1 ? '' : 's'} still need processing.
            Use <span className="font-semibold">Process Pending</span> to complete geometry and show pricing/report.
          </div>
        )}

        {configuredEntries.length > 0 && (
          <div ref={estimatorSectionRef} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Pricing & Reports</h2>
              <p className="text-xs sm:text-sm text-gray-500">{configuredEntries.length} configured file{configuredEntries.length === 1 ? '' : 's'}</p>
            </div>
            <BulkCostEstimator
              entries={configuredEntries}
              onPreviewFile={(entry) => setPreviewEntry(entry)}
            />
          </div>
        )}

        {/* File Preview Modal */}
        {previewEntry && previewEntry.cadFile && (
          <FilePreviewModal
            cadFile={previewEntry.cadFile}
            geometry={previewEntry.geometry}
            onClose={() => setPreviewEntry(null)}
          />
        )}
    </div>
  );
};

export default BulkUploadManager;
