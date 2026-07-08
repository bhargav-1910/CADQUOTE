import { Suspense, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
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
  Box,
  FileCheck2,
  Gauge,
  Layers,
  LineChart,
  Mail,
  Ruler,
  ScanSearch,
  Send,
  UploadCloud,
  Factory,
} from 'lucide-react';

const blueprintGrid = {
  backgroundImage:
    'linear-gradient(to right, rgba(2,132,199,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(2,132,199,0.07) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

const darkBlueprintGrid = {
  backgroundImage:
    'linear-gradient(to right, rgba(56,189,248,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.06) 1px, transparent 1px)',
  backgroundSize: '36px 36px',
};

const ROUTING_STEPS = [
  {
    op: 'OP 10',
    title: 'Upload CAD',
    detail: 'Drop STEP or STL files. Geometry, holes and wall thickness are measured automatically.',
    icon: UploadCloud,
  },
  {
    op: 'OP 20',
    title: 'Configure the job',
    detail: 'Material, finish, tolerance tier, inspection level and quantity — with live re-pricing.',
    icon: FileCheck2,
  },
  {
    op: 'OP 30',
    title: 'Review the price',
    detail: 'Every rupee itemized: stock, cycle time, setups, tooling, quality and margin.',
    icon: LineChart,
  },
  {
    op: 'OP 40',
    title: 'Deliver the quote',
    detail: 'Branded PDF, emailed to your customer with validity tracking built in.',
    icon: Send,
  },
];

const FEATURES = [
  {
    icon: Box,
    title: 'Exact CAD preview',
    detail: 'STEP files render with true B-rep edges in the browser — section views, measurements-grade dimensions, fullscreen inspection.',
  },
  {
    icon: Ruler,
    title: 'Tolerance-aware pricing',
    detail: 'General ±0.10, precision ±0.05 or tight ±0.01 mm — machining time and inspection cost scale the way your shop floor does.',
  },
  {
    icon: Layers,
    title: 'Quantity breaks',
    detail: 'Unit economics at 1 / 10 / 50 / 100 pieces on every quote, so customers see the case for larger batches.',
  },
  {
    icon: ScanSearch,
    title: 'DFM with savings attached',
    detail: 'Thin walls, deep holes, extreme aspect ratios — each issue priced, with the estimated saving if the customer fixes it.',
  },
  {
    icon: Factory,
    title: 'Live shop-load pricing',
    detail: 'Quotes route to the best-fit vendor and price against real machine load, not a static rate card.',
  },
  {
    icon: Mail,
    title: 'Customer-ready delivery',
    detail: 'One flow from CAD to branded PDF in the customer’s inbox — with quote validity enforced automatically.',
  },
];

const MATERIALS_TICKER = [
  'ALUMINUM 6061-T6',
  'STAINLESS 304',
  'STAINLESS 316L',
  'MILD STEEL EN8',
  'BRASS C360',
  'COPPER C110',
  'TITANIUM GR5',
  'DELRIN · POM',
  'NYLON PA6',
  'ANODIZE TYPE II',
  'BLACK OXIDE',
  'POWDER COAT',
  'ELECTROLESS NICKEL',
];

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
    <div className="whitespace-nowrap rounded border border-sky-400/50 bg-slate-950/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sky-200 shadow-lg shadow-slate-950/50">
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
  <div className="relative h-[400px] sm:h-[460px] lg:h-[540px] rounded-2xl border border-sky-500/20 bg-slate-900/60 overflow-hidden shadow-2xl shadow-sky-950/40">
    {/* fine viewport grid */}
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(56,189,248,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.05) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
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
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 10, 6]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 4, -8]} intensity={0.55} />
      <directionalLight position={[-4, -3, 6]} intensity={0.4} />
      <Suspense fallback={null}>
        <MachinedAssembly animate={animate} />
        <ContactShadows position={[0, -2.15, 0]} opacity={0.4} scale={11} blur={2.6} color="#020617" />
        {/* Local light rig — no runtime HDRI download (CSP-safe, offline-safe). */}
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={3} position={[0, 6, -2]} scale={[9, 3, 1]} rotation-x={Math.PI / 2} />
          <Lightformer intensity={1.6} position={[-6, 2, 4]} scale={[6, 3, 1]} rotation-y={Math.PI / 3} />
          <Lightformer intensity={1.1} position={[7, 3, 2]} scale={[5, 4, 1]} rotation-y={-Math.PI / 3} />
        </Environment>
      </Suspense>
    </Canvas>

    {/* drawing-sheet HUD */}
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      <span className="absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-sky-500/40" />
      <span className="absolute right-3 top-3 h-5 w-5 border-r-2 border-t-2 border-sky-500/40" />
      <span className="absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-sky-500/40" />
      <span className="absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-sky-500/40" />
      <p className="absolute left-10 top-4 font-mono text-[10px] font-medium tracking-[0.18em] text-sky-300/80">
        VIEW · ISO
      </p>
      <p className="absolute right-10 top-4 font-mono text-[10px] font-medium tracking-[0.18em] text-sky-300/80">
        UNITS · MM
      </p>
      <p className="absolute bottom-4 left-10 font-mono text-[10px] font-medium tracking-[0.18em] text-sky-300/80">
        TOL ISO 2768-mK
      </p>
      <p className="absolute bottom-4 right-10 font-mono text-[10px] font-medium tracking-[0.18em] text-sky-300/80">
        SCALE 1:1
      </p>
    </div>
    <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-950/70 px-3 py-1 font-mono text-[10px] text-slate-400 backdrop-blur-sm">
      drag to rotate
    </p>
  </div>
);

// Dimensioned flange drawing used as CTA background art.
const FlangeDrawing = () => (
  <svg viewBox="0 0 260 260" className="h-full w-auto" fill="none" aria-hidden>
    <g stroke="#38bdf8" strokeWidth="1">
      <circle cx="130" cy="130" r="95" opacity="0.55" />
      <circle cx="130" cy="130" r="36" opacity="0.55" />
      <circle cx="130" cy="130" r="66" strokeDasharray="6 4" opacity="0.4" />
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i * Math.PI) / 3;
        return (
          <circle
            key={i}
            cx={130 + 66 * Math.cos(a)}
            cy={130 + 66 * Math.sin(a)}
            r="9"
            opacity="0.55"
          />
        );
      })}
      <line x1="130" y1="18" x2="130" y2="242" strokeDasharray="14 5 3 5" opacity="0.3" />
      <line x1="18" y1="130" x2="242" y2="130" strokeDasharray="14 5 3 5" opacity="0.3" />
      <line x1="197" y1="63" x2="230" y2="30" opacity="0.55" />
    </g>
    <text x="196" y="24" fill="#7dd3fc" fontFamily="ui-monospace, monospace" fontSize="11" opacity="0.75">
      Ø 190
    </text>
  </svg>
);

const LandingPage = () => {
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const animate = !prefersReducedMotion;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-slate-100 text-slate-900">
      <style>{`
        @keyframes fq-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .fq-rise { opacity: 0; animation: fq-rise 0.7s cubic-bezier(0.2, 0.7, 0.3, 1) forwards; }
        @keyframes fq-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .fq-marquee { display: flex; width: max-content; animation: fq-scroll 48s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .fq-rise { animation: none; opacity: 1; }
          .fq-marquee { animation: none; }
        }
      `}</style>

      {/* Header */}
      <header className="w-full border-b border-slate-800 bg-slate-950/85 backdrop-blur sticky top-0 z-40">
        <div className="w-full px-4 sm:px-8 lg:px-14 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/25">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-semibold text-white leading-none">ForgeQuote</p>
              <p className="text-[11px] text-slate-400 leading-none mt-1">CNC Cost Studio</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              Create workspace
            </Link>
          </div>
        </div>
      </header>

      {/* Hero: dark drawing sheet with live 3D viewport */}
      <section className="relative w-full bg-slate-950 text-white" style={darkBlueprintGrid}>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-sky-500/10 to-transparent"
          aria-hidden
        />
        <div className="relative w-full px-4 sm:px-8 lg:px-14 pt-14 pb-16 lg:pt-20 lg:pb-24 grid gap-12 lg:grid-cols-[0.95fr_1.05fr] items-center max-w-[1720px] mx-auto">
          <div>
            <p
              className="fq-rise inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-sky-300"
              style={{ animationDelay: '0.05s' }}
            >
              <Gauge className="w-3.5 h-3.5" />
              For CNC job shops and precision component suppliers
            </p>
            <h1
              className="fq-rise mt-5 font-display text-[2.6rem] leading-[1.05] sm:text-6xl xl:text-[4.4rem] font-semibold tracking-tight"
              style={{ animationDelay: '0.12s' }}
            >
              A STEP file goes in.
              <br />
              A <span className="text-sky-400">priced, defensible quote</span> comes out.
            </h1>
            <p
              className="fq-rise mt-6 max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed"
              style={{ animationDelay: '0.2s' }}
            >
              ForgeQuote measures the geometry, checks manufacturability, prices every operation
              from stock to inspection, and emails your customer a branded PDF — in the time it
              takes to open a spreadsheet.
            </p>

            <div className="fq-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '0.28s' }}>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-6 py-3.5 font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:bg-sky-400 hover:shadow-sky-400/40"
              >
                Start quoting free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Sign in
              </Link>
            </div>

            <dl className="fq-rise mt-10 flex flex-wrap gap-x-10 gap-y-4" style={{ animationDelay: '0.36s' }}>
              {[
                ['STEP · STL', 'file formats, parsed exactly'],
                ['< 60 sec', 'from upload to full price'],
                ['₹ INR', 'India machining benchmarks'],
                ['10+ checks', 'DFM rules, each one costed'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-mono text-xl font-semibold text-white">{value}</dt>
                  <dd className="text-xs text-slate-400 mt-0.5">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="fq-rise" style={{ animationDelay: '0.25s' }}>
            <HeroViewport animate={animate} />
          </div>
        </div>

        {/* Materials & finishes ticker */}
        <div className="relative border-t border-slate-800/80 bg-slate-900/60 overflow-hidden py-3">
          <div className="fq-marquee">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {MATERIALS_TICKER.map((material) => (
                  <span
                    key={`${copy}-${material}`}
                    className="flex items-center font-mono text-[11px] font-medium tracking-[0.2em] text-slate-400"
                  >
                    <span className="px-6">{material}</span>
                    <span className="text-sky-600">◦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Routing sheet: how it works */}
      <section className="w-full bg-white border-b border-slate-200">
        <div className="w-full px-4 sm:px-8 lg:px-14 py-14 lg:py-20 max-w-[1720px] mx-auto">
          <p className="font-mono text-xs font-semibold tracking-[0.2em] text-sky-700 uppercase">Process routing</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-slate-900">
            From raw CAD to delivered quote, one routing sheet.
          </h2>

          <div className="mt-10 grid gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200 md:grid-cols-4">
            {ROUTING_STEPS.map(({ op, title, detail, icon: Icon }) => (
              <div key={op} className="bg-white p-6 lg:p-8 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-slate-500">{op}</span>
                  <Icon className="w-5 h-5 text-sky-600" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900 text-lg">{title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Job card: the quote behind the part */}
      <section className="w-full" style={blueprintGrid}>
        <div className="w-full px-4 sm:px-8 lg:px-14 py-14 lg:py-20 grid gap-12 lg:grid-cols-[0.9fr_1.1fr] items-center max-w-[1720px] mx-auto">
          <div>
            <p className="font-mono text-xs font-semibold tracking-[0.2em] text-sky-700 uppercase">The output</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-slate-900">
              Every part leaves with a job card like this.
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed max-w-xl">
              Measured dimensions, material and finish, a DFM score with the money it can recover,
              and quantity breaks your customer can act on — all generated from the CAD file, all
              defensible line by line.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'Geometry measured from the file, not typed from a drawing',
                'DFM issues priced individually, with savings if fixed',
                'Quantity breaks at 1 / 25 / 100 pieces on every quote',
                'Validity dates enforced — expired quotes cannot be sent',
              ].map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Signature artifact: a machining job card */}
          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-sky-200/40 via-transparent to-amber-200/40 blur-2xl" aria-hidden />
            <div className="relative rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-400/20 overflow-hidden">
              <div className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
                <div>
                  <p className="font-mono text-[11px] text-slate-400">JOB CARD</p>
                  <p className="font-semibold text-sm">QT-20260707-4A2C1B</p>
                </div>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                  Exact CAD geometry
                </span>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">motor_mount_rev3.step</p>
                    <p className="font-mono text-sm text-slate-800 mt-1">120.0 × 64.5 × 18.0 mm</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">Aluminum 6061</span>
                      <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">Anodized Type II</span>
                      <span className="rounded-md bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] font-medium text-sky-700">±0.05 mm precision</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-slate-500">Unit price · Qty 25</p>
                    <p className="font-display text-2xl font-semibold text-slate-900">₹1,284.50</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">7.5 days lead time</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
                    <span>DFM score</span>
                    <span className="text-emerald-600">86 · Good — ₹94/part recoverable</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="grid grid-cols-4 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>Qty</span>
                    <span className="text-right">Unit</span>
                    <span className="text-right">Total</span>
                    <span className="text-right">Saving</span>
                  </div>
                  {[
                    ['1', '₹2,120.10', '₹2,120.10', '—', false],
                    ['25', '₹1,284.50', '₹32,112.50', '-39%', true],
                    ['100', '₹1,092.75', '₹1,09,275.00', '-48%', false],
                  ].map(([qty, unit, total, saving, active]) => (
                    <div
                      key={qty as string}
                      className={`grid grid-cols-4 px-3 py-1.5 font-mono text-xs border-t border-slate-100 ${
                        active ? 'bg-sky-50 text-sky-900 font-semibold' : 'text-slate-600'
                      }`}
                    >
                      <span>{qty}</span>
                      <span className="text-right">{unit}</span>
                      <span className="text-right">{total}</span>
                      <span className={`text-right ${saving !== '—' ? 'text-emerald-600' : ''}`}>{saving}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-slate-500">Valid until 21 Jul 2026</p>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                    <Send className="w-3.5 h-3.5" />
                    Email quote PDF
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="w-full bg-white border-t border-slate-200">
        <div className="w-full px-4 sm:px-8 lg:px-14 py-14 lg:py-20 max-w-[1720px] mx-auto">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-semibold tracking-[0.2em] text-sky-700 uppercase">Capabilities</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-slate-900">
              Built like an estimator thinks.
            </h2>
            <p className="mt-3 text-slate-600">
              Every number on a ForgeQuote is traceable — stock size, cycle time, setups, tooling,
              inspection load — so you can defend it to a customer or an auditor.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, detail }) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-sm p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative w-full overflow-hidden bg-slate-950 text-white" style={darkBlueprintGrid}>
        <div className="pointer-events-none absolute -right-10 top-1/2 hidden h-[135%] -translate-y-1/2 lg:block" aria-hidden>
          <FlangeDrawing />
        </div>
        <div className="relative w-full px-4 sm:px-8 lg:px-14 py-14 lg:py-16 max-w-[1720px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-mono text-xs font-semibold tracking-[0.2em] text-sky-400 uppercase">No spreadsheets were harmed</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold">
              Quote the next RFQ in under a minute.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0 md:pr-40">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-6 py-3.5 font-semibold text-white transition hover:bg-sky-400"
            >
              Create workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-6 py-3.5 font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      <footer className="w-full bg-slate-950 border-t border-slate-800/70 text-slate-400">
        <div className="w-full px-4 sm:px-8 lg:px-14 py-6 max-w-[1720px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <p>ForgeQuote — CNC Cost Studio</p>
          <p className="font-mono">STEP · STL &nbsp;|&nbsp; DFM-priced &nbsp;|&nbsp; INR benchmarks</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
