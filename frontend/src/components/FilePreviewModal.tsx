import { useEffect, useRef, useState } from 'react';
import { X, Eye, BarChart3, Maximize, Minimize } from 'lucide-react';
import ModelViewer from './ModelViewer';
import DFXAnalysis from './DFXAnalysis';
import { Button, Dialog } from './ui';
import type { CADFile, GeometryAnalysis } from '@/types';

interface FilePreviewModalProps {
  cadFile: CADFile;
  geometry?: GeometryAnalysis;
  onClose: () => void;
}

type Tab = 'preview' | 'dfx' | 'specs';

const TABS: Array<{ id: Tab; label: string; icon: typeof Eye; needsGeometry: boolean }> = [
  { id: 'preview', label: '3D Preview', icon: Eye, needsGeometry: false },
  { id: 'dfx', label: 'DFX', icon: BarChart3, needsGeometry: true },
  { id: 'specs', label: 'Specs', icon: BarChart3, needsGeometry: true },
];

const FilePreviewModal = ({ cadFile, geometry, onClose }: FilePreviewModalProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const hasGeometry = Boolean(geometry);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      modalRef.current?.requestFullscreen().catch(() => undefined);
    }
  };

  // <dialog> renders in the top layer, so no sticky header can paint over it.
  return (
    <Dialog open onClose={onClose} label={`Preview of ${cadFile.original_filename}`} className="max-w-[1600px] overflow-hidden">
      <div
        ref={modalRef}
        className="bg-surface h-[calc(100dvh-2rem)] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 sm:px-6 py-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-ink truncate">{cadFile.original_filename}</h2>
            <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
              {(cadFile.file_size / 1024 / 1024).toFixed(2)} MB • {cadFile.file_format.toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview" title="Close">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Preview sections" className="grid grid-cols-3 border-b border-edge bg-surface-muted">
          {TABS.map(({ id, label, icon: Icon, needsGeometry }) => {
            const disabled = needsGeometry && !hasGeometry;
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => setActiveTab(id)}
                className={`flex min-h-[44px] items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 text-xs sm:text-sm font-medium border-b-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-ink-secondary hover:text-ink'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className={`flex-1 min-h-0 ${activeTab === 'preview' ? 'flex flex-col p-3 sm:p-4' : 'overflow-y-auto p-4 sm:p-6'}`}>
          {activeTab === 'preview' && (
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              {!hasGeometry && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 text-xs sm:text-sm text-amber-800 dark:text-amber-300">
                  Geometry analysis is still running for this file. 3D preview is available now, and DFX/spec details will unlock once processing finishes.
                </div>
              )}
              <div className="flex-1 min-h-0">
                <ModelViewer
                  fileId={cadFile.id}
                  fileFormat={cadFile.file_format}
                  geometry={geometry}
                  className="h-full"
                />
              </div>
            </div>
          )}

          {activeTab === 'dfx' && (
            hasGeometry ? (
              <DFXAnalysis geometry={geometry!} />
            ) : (
              <div className="bg-surface-muted border border-edge rounded-lg p-4 text-sm text-ink-secondary">
                DFX analysis is not available yet for this file.
              </div>
            )
          )}

          {activeTab === 'specs' && hasGeometry && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">Geometry Specifications</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Volume</p>
                    <p className="text-2xl font-bold text-ink mt-1">{geometry!.volume.toFixed(2)}</p>
                    <p className="text-xs text-ink-muted mt-1">cm³</p>
                  </div>

                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Surface Area</p>
                    <p className="text-2xl font-bold text-ink mt-1">{geometry!.surface_area.toFixed(2)}</p>
                    <p className="text-xs text-ink-muted mt-1">cm²</p>
                  </div>

                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Complexity Score</p>
                    <p className="text-2xl font-bold text-ink mt-1">{geometry!.complexity_score.toFixed(2)}</p>
                    <p className="text-xs text-ink-muted mt-1">ratio</p>
                  </div>

                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Min Wall Thickness</p>
                    <p className="text-2xl font-bold text-ink mt-1">
                      {geometry!.min_wall_thickness ? `${geometry!.min_wall_thickness.toFixed(2)}` : 'N/A'}
                    </p>
                    <p className="text-xs text-ink-muted mt-1">mm</p>
                  </div>

                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Hole Count</p>
                    <p className="text-2xl font-bold text-ink mt-1">{geometry!.hole_count}</p>
                  </div>

                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Threaded Holes (est.)</p>
                    <p className="text-2xl font-bold text-ink mt-1">{geometry!.estimated_thread_count ?? 0}</p>
                    <p className="text-xs text-ink-muted mt-1">matched to standard tap-drill sizes</p>
                  </div>

                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Removal Ratio</p>
                    <p className="text-2xl font-bold text-ink mt-1">{(geometry!.removal_ratio * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">Bounding Box Dimensions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-primary-50 dark:bg-primary-500/10 rounded-lg p-4 border border-primary-200 dark:border-primary-500/30">
                    <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">X (Width)</p>
                    <p className="text-2xl font-bold text-primary-900 dark:text-primary-300 mt-2">{geometry!.bounding_box.x.toFixed(2)}</p>
                    <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">cm</p>
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-lg p-4 border border-emerald-200 dark:border-emerald-500/30">
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Y (Length)</p>
                    <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-300 mt-2">{geometry!.bounding_box.y.toFixed(2)}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">cm</p>
                  </div>

                  <div className="bg-purple-50 dark:bg-purple-500/10 rounded-lg p-4 border border-purple-200 dark:border-purple-500/30">
                    <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Z (Height)</p>
                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-300 mt-2">{geometry!.bounding_box.z.toFixed(2)}</p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">cm</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">Mesh Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Triangle Count</p>
                    <p className="text-2xl font-bold text-ink mt-1">
                      {geometry!.triangle_count?.toLocaleString() || 'N/A'}
                    </p>
                  </div>

                  <div className="bg-surface-muted rounded-lg p-4">
                    <p className="text-sm text-ink-secondary font-medium">Vertex Count</p>
                    <p className="text-2xl font-bold text-ink mt-1">
                      {geometry!.vertex_count?.toLocaleString() || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-ink mb-4">Analysis Time</h3>
                <p className="text-ink-secondary">
                  Geometry analysis completed in{' '}
                  <span className="font-semibold">{geometry!.analysis_time_seconds?.toFixed(2) || 'N/A'}</span> seconds
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </Dialog>
  );
};

export default FilePreviewModal;
