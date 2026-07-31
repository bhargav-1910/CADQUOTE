import { ReactNode, Suspense, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_NAV } from '@/legal/content';
import { COOKIE_PREFERENCES_EVENT } from '@/components/CookieConsent';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  ContactShadows,
  Edges,
  Environment,
  Float,
  Html,
  Lightformer,
  OrbitControls,
  PerspectiveCamera,
} from '@react-three/drei';
import {
  ArrowRight,
  FileCheck2,
  KeyRound,
  LineChart,
  Lock,
  RefreshCcw,
  Send,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Design tokens — dark industrial "machine shop terminal" language.
// ---------------------------------------------------------------------------
const INK = {
  page: '#050506',
  band: '#08080A',
  panel: '#0E0E11',
  inset: '#0A0A0D',
};
const ACCENT_BLUE = '#8FAEF5'; // eyebrows, codes, ids
const HEADLINE_BLUE = '#A8C2FF'; // gradient headline highlight
const ACCENT_ORANGE = '#F2A35E'; // primary CTA

const ROUTING_STEPS = [
  {
    op: 'OP-10',
    title: 'Upload CAD',
    detail: 'Drop STEP or STL files. Geometry, holes and wall thickness are measured automatically.',
    icon: UploadCloud,
  },
  {
    op: 'OP-20',
    title: 'Configure the Job',
    detail: 'Material, finish, tolerance tier, inspection level and quantity — with live re-pricing.',
    icon: FileCheck2,
  },
  {
    op: 'OP-30',
    title: 'Review the Price',
    detail: 'Every rupee itemized: stock, cycle time, setups, tooling, quality and margin.',
    icon: LineChart,
  },
  {
    op: 'OP-40',
    title: 'Send the Quote',
    detail: 'Branded PDF, emailed to your customer with validity tracking built in.',
    icon: Send,
  },
];

const PIPELINE_ROWS: Array<{
  id: string;
  process: string;
  tolerance: string;
  status: string;
  dot: string;
  pulse?: boolean;
}> = [
  { id: '#QT-992X', process: '5-AXIS MILL', tolerance: '±0.010mm', status: 'PRICING', dot: '#8FAEF5', pulse: true },
  { id: '#QT-441A', process: 'LATHE_TURN', tolerance: '±0.050mm', status: 'DFM_REVIEW', dot: '#F2A35E' },
  { id: '#QT-108Z', process: '3-AXIS MILL', tolerance: '±0.100mm', status: 'SENT', dot: '#34d399' },
];

// Periodic-table style material tiles — symbol, grade, family, family hue.
const MATERIAL_TILES = [
  { sym: 'Al', grade: '6061-T6', family: 'ALUMINUM', hue: '#8FAEF5' },
  { sym: 'Ss', grade: '304', family: 'STAINLESS', hue: '#A3B8CE' },
  { sym: 'Ss', grade: '316L', family: 'STAINLESS', hue: '#A3B8CE' },
  { sym: 'Fe', grade: 'EN8', family: 'MILD STEEL', hue: '#C2C9D4' },
  { sym: 'Br', grade: 'C360', family: 'BRASS', hue: '#E5C07B' },
  { sym: 'Cu', grade: 'C110', family: 'COPPER', hue: '#E8946A' },
  { sym: 'Ti', grade: 'GR5', family: 'TITANIUM', hue: '#C4B5FD' },
  { sym: 'Pm', grade: 'DELRIN', family: 'ACETAL · POM', hue: '#7DD3A8' },
];

const FLOW_STAGES = ['PARSE', 'CONFIGURE', 'PRICE', 'SEND'];

// ---------------------------------------------------------------------------
// Live 3D hero — a machined assembly built from primitives, annotated like a
// drawing sheet. Turned shaft (lathe profile), milled bracket, hex nut.
// ---------------------------------------------------------------------------

const SHAFT_PROFILE: Array<[number, number]> = [
  [0.02, -1.7], [0.52, -1.7], [0.52, -1.25], [0.72, -1.25], [0.72, -0.55],
  [0.55, -0.55], [0.55, -0.35], [0.92, -0.35], [0.92, 0.45], [0.64, 0.45],
  [0.64, 0.6], [0.92, 0.6], [0.92, 0.95], [0.48, 0.95], [0.48, 1.55],
  [0.34, 1.55], [0.34, 1.8], [0.02, 1.8],
];

const METAL = { color: '#aeb9c6', metalness: 0.85, roughness: 0.32 };
const BORE = { color: '#0f172a', metalness: 0.2, roughness: 0.85 };
const EDGE_COLOR = '#28364a';

const DimLabel = ({ position, text }: { position: [number, number, number]; text: string }) => (
  <Html position={position} center distanceFactor={7} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
    <div
      className="whitespace-nowrap rounded border bg-black/85 px-1.5 py-0.5 font-mono text-[10px] font-medium shadow-lg shadow-black/50"
      style={{ borderColor: 'rgba(143,174,245,0.45)', color: HEADLINE_BLUE }}
    >
      {text}
    </div>
  </Html>
);

const MachinedAssembly = ({ animate }: { animate: boolean }) => {
  const group = useRef<THREE.Group>(null);
  // Duplicate interior profile points so lathe normals split at each corner —
  // otherwise the stepped shaft shades like a smooth dome instead of machined steps.
  const lathePoints = useMemo(
    () =>
      SHAFT_PROFILE.flatMap(([x, y], index) =>
        index === 0 || index === SHAFT_PROFILE.length - 1
          ? [new THREE.Vector2(x, y)]
          : [new THREE.Vector2(x, y), new THREE.Vector2(x, y)],
      ),
    [],
  );

  useFrame((_, delta) => {
    if (animate && group.current) group.current.rotation.y += delta * 0.16;
  });

  return (
    <group ref={group}>
      {/* Turned shaft, leaning like a part presented for inspection */}
      <group rotation={[0.45, 0, -0.65]} position={[0.1, 0.1, 0]}>
        <mesh castShadow receiveShadow>
          <latheGeometry args={[lathePoints, 96]} />
          <meshStandardMaterial {...METAL} />
          <Edges threshold={24} color={EDGE_COLOR} />
        </mesh>
        <DimLabel position={[1.25, 0.78, 0]} text="Ø 36.8 h6" />
        <DimLabel position={[0.75, -1.55, 0]} text="Ra 1.6" />
      </group>

      {/* Milled bracket with corner holes and a central boss */}
      <Float
        speed={animate ? 1.3 : 0}
        rotationIntensity={animate ? 0.25 : 0}
        floatIntensity={animate ? 0.45 : 0}
      >
        <group position={[-2.05, -0.55, 0.65]} rotation={[0.18, 0.55, 0.05]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.5, 0.4, 1.05]} />
            <meshStandardMaterial {...METAL} />
            <Edges threshold={24} color={EDGE_COLOR} />
          </mesh>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.24, 48]} />
            <meshStandardMaterial {...METAL} />
            <Edges threshold={24} color={EDGE_COLOR} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.28, 32]} />
            <meshStandardMaterial {...BORE} />
          </mesh>
          {[[-0.55, 0.33], [0.55, 0.33], [-0.55, -0.33], [0.55, -0.33]].map(([x, z]) => (
            <mesh key={`${x}:${z}`} position={[x, 0, z]}>
              <cylinderGeometry args={[0.09, 0.09, 0.44, 24]} />
              <meshStandardMaterial {...BORE} />
            </mesh>
          ))}
          <DimLabel position={[0, -0.55, 0]} text="4× Ø 5.2 THRU" />
        </group>
      </Float>

      {/* Hex nut */}
      <Float
        speed={animate ? 1.6 : 0}
        rotationIntensity={animate ? 0.35 : 0}
        floatIntensity={animate ? 0.5 : 0}
      >
        <group position={[1.95, 1.05, -0.5]} rotation={[0.5, 0.2, 0.35]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.48, 0.48, 0.34, 6]} />
            <meshStandardMaterial {...METAL} />
            <Edges threshold={10} color={EDGE_COLOR} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.23, 0.23, 0.38, 32]} />
            <meshStandardMaterial {...BORE} />
          </mesh>
        </group>
      </Float>
    </group>
  );
};

const HeroViewport = ({ animate }: { animate: boolean }) => (
  <div className="relative h-[400px] sm:h-[480px] lg:h-[560px]">
    {/* cold spotlight pooling under the assembly */}
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: 'radial-gradient(45% 45% at 50% 58%, rgba(143,174,245,0.14), transparent 70%)' }}
      aria-hidden
    />
    {/* hot reflection off the shop floor */}
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
      style={{ background: 'radial-gradient(50% 90% at 50% 100%, rgba(242,163,94,0.10), transparent 70%)' }}
      aria-hidden
    />

    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <PerspectiveCamera makeDefault position={[4.4, 2.4, 4.8]} fov={38} />
      <OrbitControls
        makeDefault
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={(2 * Math.PI) / 3}
      />
      {/* Film-noir rig: dim fill, one hard key, cold blue bounce, hot orange rim. */}
      <ambientLight intensity={0.22} />
      <directionalLight position={[8, 10, 6]} intensity={1.9} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 4, -8]} intensity={0.4} color="#8FAEF5" />
      <pointLight position={[-3, -2, 5]} intensity={14} color="#F2A35E" distance={12} decay={2} />
      <Suspense fallback={null}>
        <MachinedAssembly animate={animate} />
        <ContactShadows position={[0, -2.15, 0]} opacity={0.65} scale={11} blur={2.4} color="#000000" />
        {/* Local light rig — no runtime HDRI download (CSP-safe, offline-safe). */}
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2.4} position={[0, 6, -2]} scale={[9, 3, 1]} rotation-x={Math.PI / 2} />
          <Lightformer intensity={1.2} position={[-6, 2, 4]} scale={[6, 3, 1]} rotation-y={Math.PI / 3} color="#bcd0ff" />
          <Lightformer intensity={0.9} position={[7, 3, 2]} scale={[5, 4, 1]} rotation-y={-Math.PI / 3} color="#ffd9b0" />
        </Environment>
      </Suspense>
    </Canvas>

    <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 font-mono text-[10px] text-slate-500 backdrop-blur-sm">
      drag to rotate
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Shared button styles
// ---------------------------------------------------------------------------
const BTN_PRIMARY =
  'inline-flex items-center gap-2 rounded px-6 py-3.5 text-xs font-bold uppercase tracking-[0.14em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const BTN_OUTLINE =
  'inline-flex items-center gap-2 rounded border border-white/15 px-6 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-white/35 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50';

const PrimaryLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link
    to={to}
    className={BTN_PRIMARY}
    style={{ backgroundColor: ACCENT_ORANGE, color: '#191006', outlineColor: ACCENT_ORANGE }}
    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFB877'; }}
    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ACCENT_ORANGE; }}
  >
    {children}
  </Link>
);

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: ACCENT_BLUE }}>
    {children}
  </p>
);

/** Gradient highlight used inside the big display headlines. */
const Glow = ({ children }: { children: ReactNode }) => (
  <span
    className="bg-clip-text text-transparent"
    style={{ backgroundImage: `linear-gradient(100deg, ${HEADLINE_BLUE}, #ffffff 55%, ${HEADLINE_BLUE})` }}
  >
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// Mini UI vignettes rendered inside the four capability cards — each one is a
// tiny, honest picture of the screen that step happens on.
// ---------------------------------------------------------------------------
const VIGNETTES: Record<string, ReactNode> = {
  'OP-10': (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-[10px] text-slate-400">
        <span className="truncate">bracket_rev4.step</span>
        <span style={{ color: ACCENT_BLUE }}>PARSED</span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-white/10">
        <div className="h-full w-4/5 rounded" style={{ backgroundColor: ACCENT_BLUE }} />
      </div>
      <p className="font-mono text-[10px] text-slate-500">VOL 84.2 cm³ · 14 HOLES · MIN WALL 1.8 mm</p>
    </div>
  ),
  'OP-20': (
    <div className="space-y-1.5 font-mono text-[10px]">
      {[
        ['MATERIAL', 'AL 6061-T6'],
        ['FINISH', 'ANODIZE II'],
        ['TOLERANCE', '±0.05 mm'],
      ].map(([k, v]) => (
        <div key={k} className="flex items-center justify-between rounded border border-white/10 bg-black/30 px-2.5 py-1.5">
          <span className="text-slate-500">{k}</span>
          <span className="text-slate-300">{v}</span>
        </div>
      ))}
    </div>
  ),
  'OP-30': (
    <div className="rounded border border-white/10 bg-black/30 px-3 py-2.5">
      <p className="font-mono text-[10px] text-slate-500">TOTAL · 25 PCS</p>
      <p className="mt-0.5 font-display text-2xl font-bold text-white">₹48,730</p>
      <div className="mt-2 space-y-1 font-mono text-[10px] text-slate-500">
        <div className="flex justify-between"><span>STOCK + CYCLE</span><span className="text-slate-300">₹41,190</span></div>
        <div className="flex justify-between"><span>SETUP + QA</span><span className="text-slate-300">₹7,540</span></div>
      </div>
    </div>
  ),
  'OP-40': (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-[10px]">
        <span className="text-slate-400">QT-2041 · PDF</span>
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          SENT
        </span>
      </div>
      <p className="font-mono text-[10px] text-slate-500">VALID 14 DAYS · GST BREAKUP INCLUDED</p>
    </div>
  ),
};

// Proof bento — each number is a property of the engine, not a customer claim.
const PROOF_CARDS = [
  {
    stat: '< 60s',
    title: 'Upload to itemized price',
    detail:
      'Exact B-rep geometry is measured the moment a STEP file lands — no manual take-off, no spreadsheet, no waiting on an estimator.',
  },
  {
    stat: '100%',
    title: 'Of the price is itemized',
    detail:
      'Stock size, cycle time, setups, tooling, inspection load and margin each carry their own line. Defend any number to a customer or an auditor.',
  },
  {
    stat: '10+',
    title: 'DFM checks, each one costed',
    detail:
      'Thin walls, deep holes and extreme aspect ratios are priced individually — with the estimated saving shown if the customer fixes them.',
  },
  {
    stat: '±0.01mm',
    title: 'Tolerance-aware pricing',
    detail:
      'General, precision and tight tiers scale machining time and inspection cost the way your shop floor actually does.',
  },
];

// ---------------------------------------------------------------------------
// Diagram cards — pure inline SVG, drawn in the drawing-sheet language.
// The shaft outline is generated from the same SHAFT_PROFILE the 3D hero uses.
// ---------------------------------------------------------------------------

// Full 2D silhouette of the turned shaft: right flank from the lathe profile,
// left flank mirrored, in a 200×170 viewBox.
const shaftOutline = (() => {
  const sx = 42;
  const sy = 42;
  const cx = 100;
  const cy = 84;
  const right = SHAFT_PROFILE.map(([x, y]) => `${(cx + x * sx).toFixed(1)},${(cy - y * sy).toFixed(1)}`);
  const left = [...SHAFT_PROFILE].reverse().map(([x, y]) => `${(cx - x * sx).toFixed(1)},${(cy - y * sy).toFixed(1)}`);
  return `M ${right.join(' L ')} L ${left.join(' L ')} Z`;
})();

const DIAGRAM_STROKE = 'rgba(168,194,255,0.85)';
const DIAGRAM_FAINT = 'rgba(143,174,245,0.28)';

const ShaftDrawing = () => (
  <svg viewBox="0 0 200 170" className="w-full" role="img" aria-label="Dimensioned drawing of a turned shaft">
    {/* centerline */}
    <line x1="100" y1="4" x2="100" y2="166" stroke={DIAGRAM_FAINT} strokeWidth="0.7" strokeDasharray="7 3 1.5 3" />
    <path d={shaftOutline} fill="rgba(143,174,245,0.06)" stroke={DIAGRAM_STROKE} strokeWidth="1.1" strokeLinejoin="round" />
    {/* diameter dimension */}
    <line x1="61" y1="22" x2="139" y2="22" stroke={ACCENT_ORANGE} strokeWidth="0.8" markerStart="url(#fq-arr-l)" markerEnd="url(#fq-arr-r)" />
    <line x1="61" y1="18" x2="61" y2="42" stroke={DIAGRAM_FAINT} strokeWidth="0.6" />
    <line x1="139" y1="18" x2="139" y2="42" stroke={DIAGRAM_FAINT} strokeWidth="0.6" />
    <text x="100" y="16" textAnchor="middle" fontFamily="monospace" fontSize="8.5" fill={ACCENT_ORANGE}>Ø 36.8 h6</text>
    {/* length dimension */}
    <line x1="166" y1="13" x2="166" y2="155" stroke={ACCENT_ORANGE} strokeWidth="0.8" markerStart="url(#fq-arr-u)" markerEnd="url(#fq-arr-d)" />
    <text x="172" y="88" fontFamily="monospace" fontSize="8.5" fill={ACCENT_ORANGE} transform="rotate(90 172 88)" textAnchor="middle">147.0</text>
    {/* surface finish callout */}
    <line x1="126" y1="118" x2="152" y2="140" stroke={DIAGRAM_FAINT} strokeWidth="0.7" />
    <text x="154" y="146" fontFamily="monospace" fontSize="8" fill={DIAGRAM_STROKE}>Ra 1.6</text>
    <defs>
      <marker id="fq-arr-l" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto"><path d="M6 0 L0 3 L6 6 Z" fill={ACCENT_ORANGE} /></marker>
      <marker id="fq-arr-r" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill={ACCENT_ORANGE} /></marker>
      <marker id="fq-arr-u" markerWidth="6" markerHeight="6" refX="3" refY="1" orient="auto"><path d="M0 6 L3 0 L6 6 Z" fill={ACCENT_ORANGE} /></marker>
      <marker id="fq-arr-d" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto"><path d="M0 0 L3 6 L6 0 Z" fill={ACCENT_ORANGE} /></marker>
    </defs>
  </svg>
);

const ToolpathDrawing = () => (
  <svg viewBox="0 0 200 170" className="w-full" role="img" aria-label="Milling toolpath across a drilled plate">
    {/* plate */}
    <rect x="30" y="30" width="140" height="110" rx="6" fill="rgba(143,174,245,0.06)" stroke={DIAGRAM_STROKE} strokeWidth="1.1" />
    {/* corner holes */}
    {[[52, 52], [148, 52], [52, 118], [148, 118]].map(([x, y]) => (
      <g key={`${x}-${y}`}>
        <circle cx={x} cy={y} r="7.5" fill="none" stroke={DIAGRAM_STROKE} strokeWidth="1" />
        <line x1={x - 11} y1={y} x2={x + 11} y2={y} stroke={DIAGRAM_FAINT} strokeWidth="0.6" />
        <line x1={x} y1={y - 11} x2={x} y2={y + 11} stroke={DIAGRAM_FAINT} strokeWidth="0.6" />
      </g>
    ))}
    {/* central boss */}
    <circle cx="100" cy="85" r="17" fill="none" stroke={DIAGRAM_STROKE} strokeWidth="1" />
    <circle cx="100" cy="85" r="8" fill="none" stroke={DIAGRAM_FAINT} strokeWidth="0.8" />
    {/* animated toolpath */}
    <path
      className="fq-toolpath"
      d="M 52 52 L 148 52 L 148 118 L 52 118 L 52 52 M 52 52 L 100 85"
      fill="none"
      stroke={ACCENT_ORANGE}
      strokeWidth="1.2"
      strokeDasharray="5 4"
    />
    <text x="100" y="158" textAnchor="middle" fontFamily="monospace" fontSize="8" fill={DIAGRAM_STROKE}>4× Ø 5.2 THRU · BOSS Ø 12.0</text>
  </svg>
);

const COST_TRACE_ROWS: Array<[string, number]> = [
  ['STOCK', 62],
  ['CYCLE TIME', 100],
  ['SETUPS', 38],
  ['TOOLING', 24],
  ['INSPECTION', 30],
  ['MARGIN', 46],
];

const CostTraceDrawing = () => (
  <svg viewBox="0 0 200 170" className="w-full" role="img" aria-label="Itemized cost breakdown bars">
    {COST_TRACE_ROWS.map(([label, width], i) => {
      const y = 22 + i * 24;
      return (
        <g key={label}>
          <text x="8" y={y + 4} fontFamily="monospace" fontSize="7.5" fill={DIAGRAM_STROKE}>{label}</text>
          <line x1="72" y1={y} x2="192" y2={y} stroke={DIAGRAM_FAINT} strokeWidth="0.5" />
          <rect x="72" y={y - 4.5} width={width} height="9" rx="1.5" fill={i === COST_TRACE_ROWS.length - 1 ? 'rgba(242,163,94,0.75)' : 'rgba(143,174,245,0.55)'} />
        </g>
      );
    })}
    <text x="100" y="12" textAnchor="middle" fontFamily="monospace" fontSize="8" fill={ACCENT_ORANGE}>EVERY LINE PRICED</text>
  </svg>
);

const DIAGRAM_CARDS = [
  {
    kicker: 'SHEET 1 · GEOMETRY',
    title: 'Read like a drawing',
    caption: 'Diameters, lengths and surface callouts are lifted straight from your CAD file — the quote speaks drawing, not guesswork.',
    art: <ShaftDrawing />,
  },
  {
    kicker: 'SHEET 2 · MACHINING',
    title: 'Priced like a toolpath',
    caption: 'Holes, pockets and bosses each add real spindle minutes. Cycle time is built feature by feature, not averaged.',
    art: <ToolpathDrawing />,
  },
  {
    kicker: 'SHEET 3 · COSTING',
    title: 'Itemized to the rupee',
    caption: 'Stock, cycle, setups, tooling, inspection and margin — six honest lines your customer can audit.',
    art: <CostTraceDrawing />,
  },
];

const SECURITY_POINTS = [
  {
    icon: KeyRound,
    title: 'Rotating access tokens',
    detail: 'Sessions rotate access tokens and log out automatically on an invalid refresh.',
  },
  {
    icon: Lock,
    title: 'Private workspaces',
    detail: 'Quotes, rates and customer data are scoped to your company workspace alone.',
  },
  {
    icon: ShieldCheck,
    title: 'Your rates stay yours',
    detail: 'Machine, material and margin masters are never shared across workspaces.',
  },
  {
    icon: RefreshCcw,
    title: 'Quote validity tracking',
    detail: 'Sent quotes carry expiry dates, so stale pricing can never be accepted.',
  },
];

const LandingPage = () => {
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const animate = !prefersReducedMotion;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden text-slate-300" style={{ backgroundColor: INK.page }}>
      <style>{`
        @keyframes fq-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .fq-rise { opacity: 0; animation: fq-rise 0.7s cubic-bezier(0.2, 0.7, 0.3, 1) forwards; }
        @keyframes fq-dash { to { stroke-dashoffset: -90; } }
        .fq-toolpath { animation: fq-dash 6s linear infinite; }
        .fq-sheet:hover { box-shadow: 0 0 40px -8px rgba(143,174,245,0.25); }
        @keyframes fq-flow { 0% { left: 10%; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { left: 90%; opacity: 0; } }
        .fq-flowpulse { animation: fq-flow 4.5s ease-in-out infinite; }
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) {
          .fq-rise { animation: none; opacity: 1; }
          .fq-toolpath { animation: none; }
          .fq-flowpulse { animation: none; opacity: 0; }
          html { scroll-behavior: auto; }
        }
      `}</style>

      {/* Header */}
      <header
        className="sticky top-0 z-40 w-full border-b border-white/[0.08] backdrop-blur"
        style={{ backgroundColor: 'rgba(10,10,12,0.88)' }}
      >
        <div className="mx-auto flex w-full max-w-[1720px] items-center justify-between px-4 py-3.5 sm:px-8 lg:px-14">
          <Link to="/" className="font-display text-[17px] font-bold tracking-wide text-white">
            FORGE<span style={{ color: ACCENT_BLUE }}>_</span>QUOTE
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Sections">
            {[
              ['PLATFORM', '#platform'],
              ['PROCESS', '#process'],
              ['MATERIALS', '#materials'],
              ['SECURITY', '#security'],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="font-mono text-[11px] font-medium tracking-[0.2em] text-slate-400 transition hover:text-white"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2.5">
            <Link
              to="/login"
              className="rounded border border-white/15 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-white/35 hover:bg-white/5"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition hover:brightness-110"
              style={{ backgroundColor: ACCENT_ORANGE, color: '#191006' }}
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative w-full">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
          style={{ background: 'radial-gradient(55% 90% at 72% 10%, rgba(143,174,245,0.12), transparent 65%)' }}
          aria-hidden
        />
        <div className="relative mx-auto grid w-full max-w-[1720px] items-center gap-12 px-4 pb-16 pt-16 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-14 lg:pb-24 lg:pt-24">
          <div>
            <p
              className="fq-rise font-mono text-[11px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: ACCENT_BLUE, animationDelay: '0.05s' }}
            >
              AI-Measured · Benchmark-Priced
            </p>
            <h1
              className="fq-rise mt-5 font-display text-[2.6rem] font-bold leading-[1.06] tracking-tight text-white sm:text-6xl xl:text-[4rem]"
              style={{ animationDelay: '0.12s' }}
            >
              The Modern
              <br />
              CNC Quoting
              <br />
              <Glow>Platform.</Glow>
            </h1>
            <p
              className="fq-rise mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg"
              style={{ animationDelay: '0.2s' }}
            >
              Simplify your estimating experience with instant, fully itemized quotes for
              custom machined parts — geometry measured from the CAD file, every rupee
              traceable from stock to inspection.
            </p>

            <div className="fq-rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: '0.28s' }}>
              <PrimaryLink to="/signup">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </PrimaryLink>
              <a href="#platform" className={BTN_OUTLINE}>
                Explore the Platform
              </a>
            </div>
          </div>

          <div className="fq-rise" style={{ animationDelay: '0.25s' }}>
            <HeroViewport animate={animate} />
          </div>
        </div>
      </section>

      {/* Capability quad — each card carries a mini picture of its screen */}
      <section id="platform" className="w-full scroll-mt-20">
        <div className="mx-auto w-full max-w-[1720px] px-4 py-16 sm:px-8 lg:px-14 lg:py-20">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {ROUTING_STEPS.map(({ op, title, detail, icon: Icon }) => (
              <article
                key={op}
                className="flex flex-col rounded-lg border border-white/[0.08] p-6 transition-colors hover:border-white/20"
                style={{ backgroundColor: INK.panel }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded border border-white/10 bg-white/5">
                    <Icon className="h-4 w-4" style={{ color: ACCENT_BLUE }} />
                  </div>
                  <p className="font-mono text-[11px] font-semibold tracking-[0.18em]" style={{ color: ACCENT_BLUE }}>
                    {op}
                  </p>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{detail}</p>
                <div className="mt-5 rounded-md border border-white/[0.06] p-3" style={{ backgroundColor: INK.inset }}>
                  {VIGNETTES[op]}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Big centered statement + live pipeline */}
      <section
        id="process"
        className="relative w-full scroll-mt-20 border-t border-white/[0.06]"
        style={{ backgroundColor: INK.band }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{ background: 'radial-gradient(50% 90% at 50% 0%, rgba(143,174,245,0.08), transparent 70%)' }}
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-[1100px] px-4 py-20 text-center sm:px-8 lg:py-28">
          <h2 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl">
            Streamline your
            <br />
            <Glow>quote-to-order pipeline.</Glow>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Every job moves through one traceable flow — parsed, configured, priced and sent —
            with the state of each quote visible at a glance.
          </p>

          {/* Flow rail — a pulse travels the four stages */}
          <div className="mx-auto mt-14 max-w-[720px]" aria-hidden>
            <div className="relative">
              <div className="absolute inset-x-[10%] top-[5px] h-px bg-gradient-to-r from-transparent via-[rgba(143,174,245,0.35)] to-transparent" />
              <div className="fq-flowpulse absolute top-[3px] h-[5px] w-[5px] rounded-full" style={{ backgroundColor: ACCENT_ORANGE, boxShadow: '0 0 12px 2px rgba(242,163,94,0.7)' }} />
              <div className="relative flex items-start justify-between px-[6%]">
                {FLOW_STAGES.map((stage, i) => (
                  <div key={stage} className="flex flex-col items-center gap-2.5">
                    <span
                      className="h-[11px] w-[11px] rounded-full border"
                      style={{
                        borderColor: 'rgba(143,174,245,0.6)',
                        backgroundColor: i === FLOW_STAGES.length - 1 ? 'rgba(52,211,153,0.9)' : 'rgba(143,174,245,0.25)',
                        boxShadow: '0 0 14px 2px rgba(143,174,245,0.25)',
                      }}
                    />
                    <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-slate-500">{stage}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="mx-auto mt-10 max-w-[860px] rounded-xl p-px text-left"
            style={{
              background:
                'linear-gradient(135deg, rgba(143,174,245,0.45), rgba(255,255,255,0.07) 40%, rgba(255,255,255,0.07) 60%, rgba(242,163,94,0.4))',
              boxShadow: '0 24px 80px -24px rgba(143,174,245,0.18)',
            }}
          >
            <div className="overflow-hidden rounded-[11px]" style={{ backgroundColor: INK.panel }}>
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5" aria-hidden>
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgba(242,163,94,0.6)' }} />
                  </span>
                  <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-slate-300">
                    QUOTE PIPELINE · REAL-TIME
                  </p>
                </div>
                <p className="hidden items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-emerald-400 sm:flex">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
                  ENGINE_STATUS: ACTIVE
                </p>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[420px]">
                  <div className="grid grid-cols-[1.1fr_1.2fr_1fr_1.2fr] gap-2 px-5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <span>Quote_ID</span>
                    <span>Process</span>
                    <span>Tolerance</span>
                    <span>Status</span>
                  </div>
                  {PIPELINE_ROWS.map(({ id, process, tolerance, status, dot, pulse }) => (
                    <div
                      key={id}
                      className="grid grid-cols-[1.1fr_1.2fr_1fr_1.2fr] gap-2 border-t border-white/[0.06] px-5 py-3 font-mono text-xs"
                    >
                      <span style={{ color: ACCENT_BLUE }}>{id}</span>
                      <span className="text-slate-300">{process}</span>
                      <span className="text-slate-400">{tolerance}</span>
                      <span className="flex items-center gap-2 text-slate-300">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
                          style={{ backgroundColor: dot }}
                          aria-hidden
                        />
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3">
                <p className="font-mono text-[10px] tracking-[0.16em] text-slate-500">
                  DFM RULES · 10+ CHECKS, EACH ONE COSTED
                </p>
                <p className="font-mono text-[10px] tracking-[0.16em] text-slate-500">UPLOAD → PRICE &lt; 60s</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Proof bento — engine facts as big numerals */}
      <section className="w-full border-t border-white/[0.06]">
        <div className="mx-auto w-full max-w-[1720px] px-4 py-16 sm:px-8 lg:px-14 lg:py-24">
          <Eyebrow>Uncompromising Numbers</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Built to defend every number.
          </h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PROOF_CARDS.map(({ stat, title, detail }) => (
              <article
                key={title}
                className="rounded-lg border border-white/[0.08] p-6 transition-colors hover:border-white/20 lg:p-7"
                style={{ backgroundColor: INK.panel }}
              >
                <p
                  className="font-display text-4xl font-bold tracking-tight lg:text-5xl"
                  style={{ color: HEADLINE_BLUE, textShadow: '0 0 32px rgba(143,174,245,0.35)' }}
                >
                  {stat}
                </p>
                <h3 className="mt-4 font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Drawing sheets — diagrammatic cards */}
      <section className="w-full border-t border-white/[0.06]" style={{ backgroundColor: INK.band }}>
        <div className="mx-auto w-full max-w-[1720px] px-4 py-16 sm:px-8 lg:px-14 lg:py-24">
          <Eyebrow>The Technical File</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Drawn the way your shop reads it.
          </h2>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {DIAGRAM_CARDS.map(({ kicker, title, caption, art }) => (
              <figure
                key={kicker}
                className="fq-sheet group relative overflow-hidden rounded-lg border border-white/[0.08] p-5 transition-colors hover:border-[rgba(143,174,245,0.4)]"
                style={{ backgroundColor: INK.panel }}
              >
                <p className="font-mono text-[10px] font-semibold tracking-[0.22em]" style={{ color: ACCENT_BLUE }}>
                  {kicker}
                </p>
                <div className="mt-4 rounded-md border border-white/[0.06] p-3" style={{ backgroundColor: INK.inset }}>
                  {art}
                </div>
                <figcaption className="mt-4">
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Any part. Any material. — periodic-table stock room */}
      <section id="materials" className="relative w-full scroll-mt-20 border-t border-white/[0.06]" style={{ backgroundColor: INK.band }}>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{ background: 'radial-gradient(50% 90% at 50% 0%, rgba(143,174,245,0.07), transparent 70%)' }}
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-[1100px] px-4 py-20 text-center sm:px-8 lg:py-28">
          <h2 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl">
            Any part.
            <br />
            <Glow>Any material.</Glow>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-400">
            Milled, turned or both — priced across the stock your shop actually buys, plus
            anodize, oxide, powder and nickel finishes.
          </p>

          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {MATERIAL_TILES.map(({ sym, grade, family, hue }, i) => (
              <div
                key={`${sym}-${grade}`}
                className="group relative overflow-hidden rounded-lg border border-white/[0.08] p-4 text-left transition-all duration-300 hover:-translate-y-1"
                style={{ backgroundColor: INK.panel }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = hue;
                  e.currentTarget.style.boxShadow = `0 12px 40px -12px ${hue}55`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <span className="absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: hue, opacity: 0.7 }} aria-hidden />
                <div className="flex items-start justify-between">
                  <p className="font-display text-3xl font-bold" style={{ color: hue }}>{sym}</p>
                  <p className="font-mono text-[9px] text-slate-600">{String(i + 1).padStart(2, '0')}</p>
                </div>
                <p className="mt-2 font-mono text-xs font-semibold tracking-wider text-slate-200">{grade}</p>
                <p className="mt-0.5 font-mono text-[9px] tracking-[0.18em] text-slate-500">{family}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="w-full scroll-mt-20 border-t border-white/[0.06]">
        <div className="mx-auto w-full max-w-[1720px] px-4 py-16 text-center sm:px-8 lg:px-14 lg:py-24">
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            With a focus on trust.
            <br />
            <Glow>At every step.</Glow>
          </h2>

          <div className="mx-auto mt-14 grid max-w-6xl gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
            {SECURITY_POINTS.map(({ icon: Icon, title, detail }) => (
              <div
                key={title}
                className="group relative rounded-lg border border-white/[0.08] p-6 transition-colors hover:border-[rgba(143,174,245,0.4)]"
                style={{ backgroundColor: INK.panel }}
              >
                {/* drawing-sheet corner ticks */}
                <span className="absolute left-2 top-2 h-2.5 w-2.5 border-l border-t border-white/20 transition-colors group-hover:border-[rgba(143,174,245,0.7)]" aria-hidden />
                <span className="absolute right-2 top-2 h-2.5 w-2.5 border-r border-t border-white/20 transition-colors group-hover:border-[rgba(143,174,245,0.7)]" aria-hidden />
                <span className="absolute bottom-2 left-2 h-2.5 w-2.5 border-b border-l border-white/20 transition-colors group-hover:border-[rgba(143,174,245,0.7)]" aria-hidden />
                <span className="absolute bottom-2 right-2 h-2.5 w-2.5 border-b border-r border-white/20 transition-colors group-hover:border-[rgba(143,174,245,0.7)]" aria-hidden />

                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full border"
                  style={{
                    borderColor: 'rgba(143,174,245,0.35)',
                    backgroundColor: 'rgba(143,174,245,0.07)',
                    boxShadow: '0 0 24px -4px rgba(143,174,245,0.35)',
                  }}
                >
                  <Icon className="h-4.5 w-4.5" style={{ color: ACCENT_BLUE }} />
                </div>
                <h3 className="mt-5 text-sm font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Glowing CTA */}
      <section className="relative w-full overflow-hidden border-t border-white/[0.06]">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[340px]"
          style={{ background: 'radial-gradient(50% 80% at 50% 100%, rgba(242,163,94,0.16), transparent 70%)' }}
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-[900px] px-4 pb-24 pt-20 text-center sm:px-8 lg:pb-32 lg:pt-28">
          <h2 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl">
            Try ForgeQuote
            <br />
            <Glow>free today.</Glow>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-400">
            Create a workspace, upload a STEP file, and send your customer a fully itemized,
            branded quote in minutes.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <PrimaryLink to="/signup">
              Sign Up for Free
              <ArrowRight className="h-4 w-4" />
            </PrimaryLink>
            <Link to="/login" className={BTN_OUTLINE}>
              Sign In
            </Link>
          </div>

          {/* Hot-edge divider — the just-machined glow */}
          <div className="mx-auto mt-20 h-px w-2/3" aria-hidden>
            <div
              className="h-px w-full"
              style={{
                background: `linear-gradient(to right, transparent, ${ACCENT_ORANGE}, transparent)`,
                boxShadow: '0 0 24px 3px rgba(242,163,94,0.45)',
              }}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-white/[0.08]" style={{ backgroundColor: INK.band }}>
        <div className="mx-auto grid w-full max-w-[1720px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.8fr_1fr_1fr_1fr] lg:px-14">
          <div>
            <p className="font-display text-[15px] font-bold tracking-wide text-white">
              FORGE<span style={{ color: ACCENT_BLUE }}>_</span>QUOTE
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
              Instant, itemized CNC machining quotes for job shops and precision component
              suppliers.
            </p>
            <p className="mt-4 font-mono text-[10px] tracking-[0.2em]" style={{ color: ACCENT_BLUE }}>
              STEP · STL PARSED EXACTLY
            </p>
            <p className="mt-1 font-mono text-[10px] tracking-[0.2em]" style={{ color: ACCENT_BLUE }}>
              PRICED IN INR · INDIA BENCHMARKS
            </p>
          </div>

          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Platform</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                ['Capabilities', '#platform'],
                ['Quote pipeline', '#process'],
                ['Materials & finishes', '#materials'],
              ].map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="text-slate-400 transition hover:text-white">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Trust</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href="#security" className="text-slate-400 transition hover:text-white">
                  Security
                </a>
              </li>
              <li>
                <a href="#process" className="text-slate-400 transition hover:text-white">
                  Traceable pricing
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Account</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/login" className="text-slate-400 transition hover:text-white">
                  Sign in
                </Link>
              </li>
              <li>
                <Link to="/signup" className="text-slate-400 transition hover:text-white">
                  Create workspace
                </Link>
              </li>
            </ul>
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Legal</p>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2.5 text-sm">
              {LEGAL_NAV.map((item) => (
                <li key={item.slug}>
                  <Link to={`/legal/${item.slug}`} className="text-slate-400 transition hover:text-white">
                    {item.title}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT))}
                  className="text-slate-400 underline-offset-2 transition hover:text-white hover:underline"
                >
                  Cookie preferences
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/[0.06]">
          <div className="mx-auto flex w-full max-w-[1720px] flex-col items-center justify-between gap-2 px-4 py-5 text-[11px] text-slate-500 sm:flex-row sm:px-8 lg:px-14">
            <p className="font-mono tracking-[0.14em]">© 2026 FORGE_QUOTE — CNC COST STUDIO</p>
            <p className="font-mono tracking-[0.14em]">STEP · STL &nbsp;|&nbsp; DFM-PRICED &nbsp;|&nbsp; INR BENCHMARKS</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
