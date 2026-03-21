import { useNavigate } from 'react-router-dom';
import BulkUploadManager from '@/components/BulkUploadManager';
import { ArrowLeft, Home, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const BulkQuoteBuilder = () => {
  const navigate = useNavigate();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/" className="flex items-center gap-1 hover:text-gray-900 transition-colors">
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">Bulk Quote Builder</span>
      </nav>

      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-gradient-to-r from-slate-50 via-white to-blue-50 p-5 sm:p-7">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm sm:text-base text-blue-600 hover:text-blue-700 mb-3 sm:mb-4"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            Back to Home
          </button>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Bulk Quote Builder</h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 mt-2 max-w-3xl">
            Upload, process, configure, and price multiple CAD files in one smooth workflow.
          </p>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Step 1</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">Upload Files</p>
              <p className="text-xs text-gray-600 mt-1">Drop STEP/STL models and queue them.</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Step 2</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">Process and Configure</p>
              <p className="text-xs text-gray-600 mt-1">Set material, finish, inspection, quantity.</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Step 3</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">Review and Export</p>
              <p className="text-xs text-gray-600 mt-1">See totals, email summary, and PDF report.</p>
            </div>
          </div>
        </div>

        {/* Main Component */}
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-5 lg:p-6 border border-gray-200">
          <BulkUploadManager />
        </div>

        {/* Tips */}
        <div className="mt-6 sm:mt-8 bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-slate-900 mb-3">Tips for Best Results</h3>
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
