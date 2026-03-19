import { AlertCircle, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import type { GeometryAnalysis } from '@/types';

interface DFXAnalysisProps {
  geometry: GeometryAnalysis;
  complexity?: 'low' | 'medium' | 'high';
}

interface DFXIssue {
  severity: 'warning' | 'error' | 'info';
  title: string;
  description: string;
  recommendation: string;
}

const DFXAnalysis = ({ geometry }: DFXAnalysisProps) => {
  // Analyze geometry for manufacturability issues
  const issues: DFXIssue[] = [];

  // Check wall thickness
  if (geometry.min_wall_thickness && geometry.min_wall_thickness < 1.5) {
    issues.push({
      severity: 'error',
      title: 'Thin Walls',
      description: `Minimum wall thickness is ${geometry.min_wall_thickness}mm, which may be too thin for CNC machining.`,
      recommendation: 'Increase minimum wall thickness to 1.5mm or greater for better structural integrity.',
    });
  } else if (geometry.min_wall_thickness && geometry.min_wall_thickness < 2.0) {
    issues.push({
      severity: 'warning',
      title: 'Thin Walls',
      description: `Minimum wall thickness is ${geometry.min_wall_thickness}mm. Consider thicker walls for better results.`,
      recommendation: 'For optimal results, target minimum wall thickness of 2mm or more.',
    });
  }

  // Check complexity score
  if (geometry.complexity_score > 5) {
    issues.push({
      severity: 'warning',
      title: 'High Complexity',
      description: `Complexity score of ${geometry.complexity_score.toFixed(2)} indicates a complex geometry with many features.`,
      recommendation: 'High complexity may increase machining time and cost. Consider simplifying non-critical features.',
    });
  }

  // Check hole count
  if (geometry.hole_count > 10) {
    issues.push({
      severity: 'info',
      title: 'Multiple Holes',
      description: `Model contains ${geometry.hole_count} holes. Multiple features may impact lead time.`,
      recommendation: 'Consider consolidating holes or simplifying hole patterns if possible.',
    });
  }

  // Check removal ratio (material waste)
  if (geometry.removal_ratio < 0.3) {
    issues.push({
      severity: 'warning',
      title: 'High Material Waste',
      description: `Only ${(geometry.removal_ratio * 100).toFixed(1)}% of bounding box is used material. High waste ratio.`,
      recommendation: 'Consider redesigning to use material more efficiently or choosing a smaller stock size.',
    });
  }

  // Check aspect ratio (extreme dimensions)
  const aspectRatio = Math.max(geometry.bounding_box.x, geometry.bounding_box.y, geometry.bounding_box.z) /
    Math.min(geometry.bounding_box.x, geometry.bounding_box.y, geometry.bounding_box.z);

  if (aspectRatio > 8) {
    issues.push({
      severity: 'info',
      title: 'Extreme Aspect Ratio',
      description: `Aspect ratio of ${aspectRatio.toFixed(1)}:1 indicates very elongated geometry.`,
      recommendation: 'Setup and tooling may be specialized. Discuss production approach with manufacturing engineer.',
    });
  }

  // Manufacturability score
  const manufactScore = 100 - (issues.length * 25);
  const scoreColor =
    manufactScore >= 80 ? 'green' : manufactScore >= 60 ? 'yellow' : 'red';
  const scoreLabel =
    manufactScore >= 80 ? 'Excellent' : manufactScore >= 60 ? 'Good' : 'Fair';

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className={`border-l-4 ${
        scoreColor === 'green'
          ? 'border-green-500 bg-green-50'
          : scoreColor === 'yellow'
          ? 'border-yellow-500 bg-yellow-50'
          : 'border-red-500 bg-red-50'
      } p-4 rounded`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`font-semibold ${
              scoreColor === 'green'
                ? 'text-green-900'
                : scoreColor === 'yellow'
                ? 'text-yellow-900'
                : 'text-red-900'
            }`}>
              Manufacturability Score: {manufactScore}%
            </p>
            <p className={`text-sm ${
              scoreColor === 'green'
                ? 'text-green-700'
                : scoreColor === 'yellow'
                ? 'text-yellow-700'
                : 'text-red-700'
            }`}>
              {scoreLabel} design for CNC manufacturing
            </p>
          </div>
          {scoreColor === 'green' ? (
            <CheckCircle className="w-8 h-8 text-green-500" />
          ) : scoreColor === 'yellow' ? (
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
          ) : (
            <AlertCircle className="w-8 h-8 text-red-500" />
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-xs text-blue-600 font-medium">Volume</p>
          <p className="text-lg font-bold text-blue-900">{geometry.volume.toFixed(2)} cm³</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-xs text-blue-600 font-medium">Complexity</p>
          <p className="text-lg font-bold text-blue-900">{geometry.complexity_score.toFixed(2)}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded p-3">
          <p className="text-xs text-purple-600 font-medium">Wall Thickness</p>
          <p className="text-lg font-bold text-purple-900">
            {geometry.min_wall_thickness ? `${geometry.min_wall_thickness.toFixed(1)}mm` : 'N/A'}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded p-3">
          <p className="text-xs text-purple-600 font-medium">Holes/Features</p>
          <p className="text-lg font-bold text-purple-900">{geometry.hole_count}</p>
        </div>
      </div>

      {/* Issues & Recommendations */}
      {issues.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Manufacturing Notes:</p>
          {issues.map((issue, idx) => (
            <div
              key={idx}
              className={`border-l-4 p-3 rounded text-sm ${
                issue.severity === 'error'
                  ? 'border-red-500 bg-red-50'
                  : issue.severity === 'warning'
                  ? 'border-yellow-500 bg-yellow-50'
                  : 'border-blue-500 bg-blue-50'
              }`}
            >
              <div className="flex gap-2">
                {issue.severity === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${
                    issue.severity === 'error'
                      ? 'text-red-900'
                      : issue.severity === 'warning'
                      ? 'text-yellow-900'
                      : 'text-blue-900'
                  }`}>
                    {issue.title}
                  </p>
                  <p className={`text-xs mt-1 ${
                    issue.severity === 'error'
                      ? 'text-red-700'
                      : issue.severity === 'warning'
                      ? 'text-yellow-700'
                      : 'text-blue-700'
                  }`}>
                    {issue.description}
                  </p>
                  <p className={`text-xs mt-2 font-medium ${
                    issue.severity === 'error'
                      ? 'text-red-800'
                      : issue.severity === 'warning'
                      ? 'text-yellow-800'
                      : 'text-blue-800'
                  }`}>
                    💡 {issue.recommendation}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {issues.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
          <p className="text-sm text-green-700 font-medium">✓ No manufacturing concerns identified</p>
        </div>
      )}
    </div>
  );
};

export default DFXAnalysis;
