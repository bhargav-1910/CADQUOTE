import { AlertCircle, CheckCircle, AlertTriangle, TrendingUp, PiggyBank } from 'lucide-react';
import type { DFMIssueCostImpact, GeometryAnalysis } from '@/types';
import { analyzeDFM } from '@/services/dfm';

interface DFXAnalysisProps {
  geometry: GeometryAnalysis;
  complexity?: 'low' | 'medium' | 'high';
  /** Per-issue cost attribution from the pricing engine (keyed by issue code). */
  costImpacts?: DFMIssueCostImpact[];
}

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

const DFXAnalysis = ({ geometry, costImpacts }: DFXAnalysisProps) => {
  const analysis = analyzeDFM(geometry);
  const impactByCode = new Map((costImpacts ?? []).map((impact) => [impact.code, impact]));
  const totalPotentialSavings = (costImpacts ?? []).reduce(
    (sum, impact) => sum + Math.max(impact.estimated_cost_per_part, 0),
    0,
  );
  const issues = analysis.issues;
  const manufactScore = analysis.score;
  const scoreColor =
    manufactScore >= 80 ? 'green' : manufactScore >= 60 ? 'yellow' : 'red';
  const scoreLabel = analysis.label;

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
            <p className="text-xs text-gray-600 mt-1">
              Analysis confidence: {(analysis.confidence_score * 100).toFixed(0)}%
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

      {/* Cost optimization summary */}
      {totalPotentialSavings > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3">
          <PiggyBank className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              Up to {formatINR(totalPotentialSavings)}/part in potential savings
            </p>
            <p className="text-xs text-emerald-700">
              Resolving the design issues below removes their estimated cost impact from your quote.
            </p>
          </div>
        </div>
      )}

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
                  {(() => {
                    const impact = impactByCode.get(issue.code);
                    if (!impact || impact.estimated_cost_per_part <= 0) return null;
                    return (
                      <p className="text-xs mt-1.5 font-semibold text-emerald-700">
                        Est. savings if resolved: {formatINR(impact.estimated_cost_per_part)}/part
                        {impact.reason ? ` — ${impact.reason.toLowerCase()}` : ''}
                      </p>
                    );
                  })()}
                  <p className="text-xs mt-1 text-gray-600">
                    Confidence: {(issue.confidence * 100).toFixed(0)}%
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
