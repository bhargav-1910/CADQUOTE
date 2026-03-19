import { useNavigate } from 'react-router-dom';
import BulkUploadManager from '@/components/BulkUploadManager';
import { ArrowLeft } from 'lucide-react';

const BulkQuoteBuilder = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-6 lg:py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm sm:text-base text-blue-600 hover:text-blue-700 mb-3 sm:mb-4"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            Back to Home
          </button>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Bulk Quote Builder</h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 mt-2 max-w-3xl">
            Upload multiple CAD files at once, configure them with shared settings, and get instant cost estimates.
          </p>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
            <div className="text-2xl sm:text-3xl mb-2">📤</div>
            <h3 className="font-semibold text-gray-900 mb-2">Bulk Upload</h3>
            <p className="text-gray-600 text-sm">
              Drag and drop multiple CAD files (STEP, STL) up to 100MB each with configurable concurrent processing.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
            <div className="text-2xl sm:text-3xl mb-2">⚙️</div>
            <h3 className="font-semibold text-gray-900 mb-2">Batch Configuration</h3>
            <p className="text-gray-600 text-sm">
              Select multiple files and apply the same material, finish, and inspection settings to all at once.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 sm:col-span-2 xl:col-span-1">
            <div className="text-2xl sm:text-3xl mb-2">💰</div>
            <h3 className="font-semibold text-gray-900 mb-2">Cost Visualization</h3>
            <p className="text-gray-600 text-sm">
              See real-time cost estimates, breakdowns by file, and aggregate totals with interactive charts.
            </p>
          </div>
        </div>

        {/* Main Component */}
        <div className="bg-white rounded-xl shadow-lg p-3 sm:p-5 lg:p-6">
          <BulkUploadManager />
        </div>

        {/* Tips */}
        <div className="mt-6 sm:mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 sm:p-6">
          <h3 className="font-semibold text-blue-900 mb-3">Tips for Best Results</h3>
          <ul className="text-blue-800 space-y-2 text-sm">
            <li>✓ Adjust "Max concurrent" based on your system resources (3-5 recommended)</li>
            <li>✓ Use batch configuration to apply settings to multiple files at once</li>
            <li>✓ Pause processing at any time to adjust configurations</li>
            <li>✓ Use the 3D Preview action on each uploaded file to inspect geometry</li>
            <li>✓ Lead times are estimated and may vary based on current workload</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default BulkQuoteBuilder;
