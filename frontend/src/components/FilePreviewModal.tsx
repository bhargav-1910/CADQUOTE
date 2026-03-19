import { useState } from 'react';
import { X, Eye, BarChart3 } from 'lucide-react';
import ModelViewer from './ModelViewer';
import DFXAnalysis from './DFXAnalysis';
import type { CADFile, GeometryAnalysis } from '@/types';

interface FilePreviewModalProps {
  cadFile: CADFile;
  geometry?: GeometryAnalysis;
  onClose: () => void;
}

type Tab = 'preview' | 'dfx' | 'specs';

const FilePreviewModal = ({ cadFile, geometry, onClose }: FilePreviewModalProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const hasGeometry = Boolean(geometry);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 sm:p-6">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 break-words">{cadFile.original_filename}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {(cadFile.file_size / 1024 / 1024).toFixed(2)} MB • {cadFile.file_format.toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-0 border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Eye className="w-4 h-4 inline mr-1 sm:mr-2" />
            3D Preview
          </button>
          <button
            onClick={() => hasGeometry && setActiveTab('dfx')}
            disabled={!hasGeometry}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'dfx'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            } ${!hasGeometry ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <BarChart3 className="w-4 h-4 inline mr-1 sm:mr-2" />
            DFX
          </button>
          <button
            onClick={() => hasGeometry && setActiveTab('specs')}
            disabled={!hasGeometry}
            className={`px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'specs'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            } ${!hasGeometry ? 'opacity-50 cursor-not-allowed' : ''}
            }`}
          >
            <BarChart3 className="w-4 h-4 inline mr-1 sm:mr-2" />
            Specs
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'preview' && (
            <div className="space-y-3">
              {!hasGeometry && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-amber-800">
                  Geometry analysis is still running for this file. 3D preview is available now, and DFX/spec details will unlock once processing finishes.
                </div>
              )}
              <div className="flex items-start justify-center min-h-[280px] sm:min-h-[400px] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden">
              <ModelViewer
                fileId={cadFile.id}
                fileFormat={cadFile.file_format}
                geometry={geometry}
              />
            </div>
            </div>
          )}

          {activeTab === 'dfx' && (
            hasGeometry ? (
              <DFXAnalysis geometry={geometry!} />
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
                DFX analysis is not available yet for this file.
              </div>
            )
          )}

          {activeTab === 'specs' && hasGeometry && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Geometry Specifications</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium">Volume</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{geometry!.volume.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">cm³</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium">Surface Area</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{geometry!.surface_area.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">cm²</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium">Complexity Score</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{geometry!.complexity_score.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">ratio</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium">Min Wall Thickness</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {geometry!.min_wall_thickness ? `${geometry!.min_wall_thickness.toFixed(2)}` : 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">mm</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium">Hole Count</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{geometry!.hole_count}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium">Removal Ratio</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{(geometry!.removal_ratio * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Bounding Box Dimensions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <p className="text-sm text-blue-600 font-medium">X (Width)</p>
                    <p className="text-2xl font-bold text-blue-900 mt-2">{geometry!.bounding_box.x.toFixed(2)}</p>
                    <p className="text-xs text-blue-600 mt-1">cm</p>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <p className="text-sm text-green-600 font-medium">Y (Length)</p>
                    <p className="text-2xl font-bold text-green-900 mt-2">{geometry!.bounding_box.y.toFixed(2)}</p>
                    <p className="text-xs text-green-600 mt-1">cm</p>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <p className="text-sm text-purple-600 font-medium">Z (Height)</p>
                    <p className="text-2xl font-bold text-purple-900 mt-2">{geometry!.bounding_box.z.toFixed(2)}</p>
                    <p className="text-xs text-purple-600 mt-1">cm</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Mesh Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium">Triangle Count</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {geometry!.triangle_count?.toLocaleString() || 'N/A'}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium">Vertex Count</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {geometry!.vertex_count?.toLocaleString() || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Analysis Time</h3>
                <p className="text-gray-600">
                  Geometry analysis completed in{' '}
                  <span className="font-semibold">{geometry!.analysis_time_seconds?.toFixed(2) || 'N/A'}</span> seconds
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 sm:px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
