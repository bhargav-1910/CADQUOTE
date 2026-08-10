import { useState } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, TrendingUp, PiggyBank, ChevronDown } from 'lucide-react';
import type { DFMIssue, DFMIssueCostImpact, DFMSeverity, GeometryAnalysis } from '@/types';
import { analyzeDFM } from '@/services/dfm';

interface DFXAnalysisProps {
  geometry: GeometryAnalysis;
  complexity?: 'low' | 'medium' | 'high';
  /** Per-issue cost attribution from the pricing engine (keyed by issue code). */
  costImpacts?: DFMIssueCostImpact[];
}

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

const SEVERITY_META: Record<DFMSeverity, { label: string; icon: typeof AlertCircle; tone: string; badge: string }> = {
  error: {
    label: 'Blocking issues',
    icon: AlertCircle,
    tone: 'border-red-500 bg-red-50',
    badge: 'bg-red-100 text-red-700',
  },
  warning: {
    label: 'Warnings',
    icon: AlertTriangle,
    tone: 'border-yellow-500 bg-yellow-50',
    badge: 'bg-yellow-100 text-yellow-800',
  },
  info: {
    label: 'Advisories',
    icon: TrendingUp,
    tone: 'border-blue-500 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
  },
};

/** Radial score gauge (SVG arc). */
const ScoreGauge = ({ score }: { score: number }) => {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 80 ? '#10b981' : clamped >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
        <circle cx="42" cy="42" r={radius} fill="none" stroke="currentColor" className="text-gray-200" strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold text-gray-900 leading-none">{clamped}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">DFM</span>
      </div>
    </div>
  );
};

const IssueCard = ({ issue, impact }: { issue: DFMIssue; impact?: DFMIssueCostImpact }) => {
  const meta = SEVERITY_META[issue.severity];
  return (
    <div className={`border-l-4 p-3 rounded text-sm ${meta.tone}`}>
      <p className="font-semibold text-gray-900">{issue.title}</p>
      <p className="text-xs mt-1 text-gray-600">{issue.description}</p>
      <p className="text-xs mt-2 font-medium text-gray-700">💡 {issue.recommendation}</p>
      {impact && impact.estimated_cost_per_part > 0 && (
        <p className="text-xs mt-1.5 font-semibold text-emerald-700">
          Est. savings if resolved: {formatINR(impact.estimated_cost_per_part)}/part
          {impact.reason ? ` — ${impact.reason.toLowerCase()}` : ''}
        </p>
      )}
      <p className="text-[11px] mt-1 text-gray-400">Confidence: {(issue.confidence * 100).toFixed(0)}%</p>
    </div>
  );
};

const DFXAnalysis = ({ geometry, costImpacts }: DFXAnalysisProps) => {
  const analysis = analyzeDFM(geometry);
  const impactByCode = new Map((costImpacts ?? []).map((impact) => [impact.code, impact]));
  const totalPotentialSavings = (costImpacts ?? []).reduce(
    (sum, impact) => sum + Math.max(impact.estimated_cost_per_part, 0),
    0,
  );

  const groups = (['error', 'warning', 'info'] as DFMSeverity[])
    .map((severity) => ({
      severity,
      issues: analysis.issues.filter((issue) => issue.severity === severity),
    }))
    .filter((group) => group.issues.length > 0);

  // Blocking issues expanded by default; the rest collapsed.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ error: true });

  const toggleGroup = (severity: string) =>
    setOpenGroups((prev) => ({ ...prev, [severity]: !prev[severity] }));

  return (
    <div className="space-y-4">
      {/* Score header with gauge */}
      <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <ScoreGauge score={analysis.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{analysis.label} manufacturability</p>
            {analysis.has_blocking_issue ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {analysis.issues.length === 0
              ? 'No manufacturing concerns identified.'
              : `${analysis.issues.length} finding${analysis.issues.length === 1 ? '' : 's'} across geometry, walls and features.`}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Analysis confidence: {(analysis.confidence_score * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: 'Volume', value: `${geometry.volume.toFixed(2)} cm³` },
          { label: 'Complexity', value: geometry.complexity_score.toFixed(2) },
          {
            label: 'Min Wall',
            value: geometry.min_wall_thickness ? `${geometry.min_wall_thickness.toFixed(1)} mm` : 'N/A',
          },
          { label: 'Holes', value: String(geometry.hole_count) },
          { label: 'Threaded (est.)', value: String(geometry.estimated_thread_count ?? 0) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
            <p className="font-mono text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
          </div>
        ))}
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

      {/* Severity-grouped accordions */}
      {groups.map(({ severity, issues }) => {
        const meta = SEVERITY_META[severity];
        const Icon = meta.icon;
        const open = openGroups[severity] ?? false;
        return (
          <div key={severity} className="rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleGroup(severity)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${
                    severity === 'error' ? 'text-red-500' : severity === 'warning' ? 'text-yellow-500' : 'text-blue-500'
                  }`}
                />
                <span className="text-sm font-semibold text-gray-800">{meta.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${meta.badge}`}>{issues.length}</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="px-3 pb-3 pt-1 space-y-2 bg-gray-50/60">
                {issues.map((issue, index) => (
                  <IssueCard key={`${issue.code}-${index}`} issue={issue} impact={impactByCode.get(issue.code)} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {analysis.issues.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
          <p className="text-sm text-green-700 font-medium">✓ No manufacturing concerns identified</p>
        </div>
      )}
    </div>
  );
};

export default DFXAnalysis;
