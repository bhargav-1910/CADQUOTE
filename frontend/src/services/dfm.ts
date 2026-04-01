import type { GeometryAnalysis, DFMAnalysisResult, DFMIssue } from '@/types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const pushIssue = (
  issues: DFMIssue[],
  issue: Omit<DFMIssue, 'penalty' | 'confidence'> & { penalty?: number; confidence?: number }
) => {
  issues.push({
    ...issue,
    penalty: issue.penalty ?? 0,
    confidence: issue.confidence ?? 0.7,
  });
};

const analyzeDFMFallback = (geometry: GeometryAnalysis): DFMAnalysisResult => {
  const issues: DFMIssue[] = [];

  const x = geometry.bounding_box.x;
  const y = geometry.bounding_box.y;
  const z = geometry.bounding_box.z;
  const maxDim = Math.max(x, y, z);
  const minDim = Math.max(Math.min(x, y, z), 0.001);
  const aspectRatio = maxDim / minDim;

  // 1) Wall thickness checks
  if (geometry.min_wall_thickness == null) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'wall-thickness-unknown',
      title: 'Wall Thickness Uncertain',
      description: 'Minimum wall thickness could not be confidently measured from mesh data.',
      recommendation: 'Review critical walls manually in CAD and keep minimum wall above 1.5-2.0 mm.',
      penalty: 10,
    });
  } else if (geometry.min_wall_thickness < 1.0) {
    pushIssue(issues, {
      severity: 'error',
      code: 'wall-too-thin-critical',
      title: 'Critically Thin Walls',
      description: `Minimum wall thickness is ${geometry.min_wall_thickness.toFixed(2)} mm, likely below safe CNC limits.`,
      recommendation: 'Increase minimum wall thickness to at least 1.5 mm (2.0 mm preferred).',
      penalty: 35,
    });
  } else if (geometry.min_wall_thickness < 1.5) {
    pushIssue(issues, {
      severity: 'error',
      code: 'wall-too-thin',
      title: 'Thin Walls',
      description: `Minimum wall thickness is ${geometry.min_wall_thickness.toFixed(2)} mm and may deform during machining.`,
      recommendation: 'Increase minimum wall thickness to 1.5 mm or more.',
      penalty: 25,
    });
  } else if (geometry.min_wall_thickness < 2.0) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'wall-thin-warning',
      title: 'Wall Thickness Near Limit',
      description: `Minimum wall thickness is ${geometry.min_wall_thickness.toFixed(2)} mm, close to common process limits.`,
      recommendation: 'Target 2.0 mm or more for better stability and repeatability.',
      penalty: 12,
    });
  }

  // 2) Complexity checks (scale-robust A^(3/2)/V)
  if (geometry.complexity_score > 32) {
    pushIssue(issues, {
      severity: 'error',
      code: 'complexity-very-high',
      title: 'Very High Geometric Complexity',
      description: `Complexity score is ${geometry.complexity_score.toFixed(2)}, indicating difficult tool access and longer cycle times.`,
      recommendation: 'Simplify non-critical features and merge tiny details where possible.',
      penalty: 20,
      confidence: 0.82,
    });
  } else if (geometry.complexity_score > 24) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'complexity-high',
      title: 'High Geometric Complexity',
      description: `Complexity score is ${geometry.complexity_score.toFixed(2)}, which can increase setup and machining effort.`,
      recommendation: 'Reduce unnecessary feature transitions and sharp local geometry.',
      penalty: 12,
      confidence: 0.74,
    });
  } else if (geometry.complexity_score > 18) {
    pushIssue(issues, {
      severity: 'info',
      code: 'complexity-elevated',
      title: 'Elevated Complexity',
      description: `Complexity score is ${geometry.complexity_score.toFixed(2)}.`,
      recommendation: 'Expect moderate impact on cycle time.',
      penalty: 4,
      confidence: 0.66,
    });
  }

  // 3) Material removal efficiency
  if (geometry.removal_ratio < 0.2) {
    pushIssue(issues, {
      severity: 'error',
      code: 'removal-ratio-critical',
      title: 'Very High Material Removal',
      description: `Removal ratio is ${(geometry.removal_ratio * 100).toFixed(1)}%, indicating heavy stock removal and waste.`,
      recommendation: 'Consider near-net stock or redesign for better stock utilization.',
      penalty: 20,
    });
  } else if (geometry.removal_ratio < 0.35) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'removal-ratio-high',
      title: 'High Material Waste',
      description: `Removal ratio is ${(geometry.removal_ratio * 100).toFixed(1)}%, which may increase cost significantly.`,
      recommendation: 'Reduce bounding stock envelope or simplify outer profile.',
      penalty: 12,
    });
  }

  // 4) Hole density and feature crowding
  const holesPer100Cm3 = geometry.volume > 0
    ? (geometry.hole_count / geometry.volume) * 100
    : 0;

  if (holesPer100Cm3 > 40) {
    pushIssue(issues, {
      severity: 'error',
      code: 'holes-dense-critical',
      title: 'Extremely Dense Hole Features',
      description: `${geometry.hole_count} holes over ${geometry.volume.toFixed(2)} cm3 indicates very high feature density.`,
      recommendation: 'Consolidate hole patterns and reduce non-functional holes.',
      penalty: 18,
    });
  } else if (holesPer100Cm3 > 25) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'holes-dense',
      title: 'Dense Hole Features',
      description: `${geometry.hole_count} holes over ${geometry.volume.toFixed(2)} cm3 may increase drilling and inspection time.`,
      recommendation: 'Simplify drill patterns where possible.',
      penalty: 10,
    });
  } else if (geometry.hole_count > 15) {
    pushIssue(issues, {
      severity: 'info',
      code: 'holes-many',
      title: 'Many Hole Features',
      description: `Model contains ${geometry.hole_count} holes.`,
      recommendation: 'Expect additional drilling operations.',
      penalty: 3,
    });
  }

  // 5) Aspect ratio and fixturing risk
  if (aspectRatio > 20) {
    pushIssue(issues, {
      severity: 'error',
      code: 'aspect-ratio-critical',
      title: 'Extreme Aspect Ratio',
      description: `Aspect ratio is ${aspectRatio.toFixed(1)}:1, likely requiring special fixturing and multiple setups.`,
      recommendation: 'Split part strategy or add temporary support features for machining.',
      penalty: 20,
    });
  } else if (aspectRatio > 12) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'aspect-ratio-high',
      title: 'High Aspect Ratio',
      description: `Aspect ratio is ${aspectRatio.toFixed(1)}:1, which may reduce rigidity during cutting.`,
      recommendation: 'Review fixturing strategy and consider geometry stiffening in non-functional zones.',
      penalty: 10,
    });
  } else if (aspectRatio > 8) {
    pushIssue(issues, {
      severity: 'info',
      code: 'aspect-ratio-elevated',
      title: 'Elevated Aspect Ratio',
      description: `Aspect ratio is ${aspectRatio.toFixed(1)}:1.`,
      recommendation: 'Verify workholding and vibration risk.',
      penalty: 3,
    });
  }

  // 6) Relative thinness against smallest part dimension
  if (geometry.min_wall_thickness != null) {
    const minDimensionMm = minDim * 10;
    const thinnessRatio = geometry.min_wall_thickness / Math.max(minDimensionMm, 0.1);
    if (thinnessRatio < 0.08) {
      pushIssue(issues, {
        severity: 'warning',
        code: 'thinness-ratio-high',
        title: 'Low Relative Wall Stiffness',
        description: `Wall to minimum dimension ratio is ${(thinnessRatio * 100).toFixed(1)}%, which can increase chatter risk.`,
        recommendation: 'Increase critical wall sections or reduce unsupported span.',
        penalty: 8,
      });
    }
  }

  // 7) Very high mesh detail can indicate noisy tessellation
  if (geometry.triangle_count != null && geometry.triangle_count > 500000) {
    pushIssue(issues, {
      severity: 'info',
      code: 'mesh-very-dense',
      title: 'Very Dense Mesh',
      description: `Mesh has ${geometry.triangle_count.toLocaleString()} triangles, which may inflate analysis time.`,
      recommendation: 'Use a cleaner export tolerance for faster and more stable analysis.',
      penalty: 2,
    });
  }

  const totalPenalty = issues.reduce((sum, issue) => sum + issue.penalty, 0);
  const score = clamp(Math.round(100 - totalPenalty), 0, 100);
  const hasBlockingIssue = issues.some((issue) => issue.severity === 'error');
  const confidenceScore = issues.length > 0
    ? Number((issues.reduce((sum, issue) => sum + issue.confidence, 0) / issues.length).toFixed(2))
    : 0.9;

  let label: DFMAnalysisResult['label'] = 'Excellent';
  if (score < 50) {
    label = 'High Risk';
  } else if (score < 70) {
    label = 'Moderate';
  } else if (score < 85) {
    label = 'Good';
  }

  return {
    score,
    label,
    issues,
    has_blocking_issue: hasBlockingIssue,
    total_penalty: totalPenalty,
    confidence_score: confidenceScore,
  };
};

export const analyzeDFM = (geometry: GeometryAnalysis): DFMAnalysisResult => {
  if (geometry.dfm_analysis) {
    return geometry.dfm_analysis;
  }
  return analyzeDFMFallback(geometry);
};
