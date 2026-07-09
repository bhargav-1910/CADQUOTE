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
  FileCheck2,
  LineChart,
  Ruler,
  ScanSearch,
  Send,
  UploadCloud,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Design tokens — dark industrial "machine shop terminal" language.
// ---------------------------------------------------------------------------
const INK = {
  page: '#0A0A0C',
  band: '#0E0E11',
  panel: '#131317',
  inset: '#0F0F12',
};
const ACCENT_BLUE = '#8FAEF5'; // eyebrows, codes, ids
const HEADLINE_BLUE = '#A8C2FF'; // second headline line
const ACCENT_ORANGE = '#F2A35E'; // primary CTA

const heroGrid = {
  backgroundImage:
    `linear-gradient(to right, rgba(143,174,245,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(143,174,245,0.045) 1px, transparent 1px)`,
  backgroundSize: '36px 36px',
};

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

const STANDARDS = [
  {
    icon: LineChart,
    title: 'Traceable Pricing',
    detail:
      'Every number on the quote is itemized — stock size, cycle time, setups, tooling and inspection load — so you can defend it to a customer or an auditor.',
  },
  {
    icon: ScanSearch,
    title: 'DFM With Savings Attached',
    detail:
      'Thin walls, deep holes and extreme aspect ratios are each priced individually, with the estimated saving if the customer fixes them.',
  },
  {
    icon: Ruler,
    title: 'Tolerance-Aware Quoting',
    detail:
      'General ±0.10, precision ±0.05 or tight ±0.01 mm — machining time and inspection cost scale the way your shop floor does.',
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
  <div
    className="relative h-[380px] sm:h-[440px] lg:h-[520px] overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/60"
    style={{ backgroundColor: '#101014' }}
  >
    {/* fine viewport grid */}
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(143,174,245,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(143,174,245,0.05) 1px, transparent 1px)',
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
        <ContactShadows position={[0, -2.15, 0]} opacity={0.45} scale={11} blur={2.6} color="#000000" />
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
      <span className="absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-white/20" />
      <span className="absolute right-3 top-3 h-5 w-5 border-r-2 border-t-2 border-white/20" />
      <span className="absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-white/20" />
      <span className="absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-white/20" />
      <p className="absolute left-10 top-4 font-mono text-[10px] font-medium tracking-[0.18em]" style={{ color: 'rgba(143,174,245,0.8)' }}>
        VIEW · ISO
      </p>
      <p className="absolute right-10 top-4 font-mono text-[10px] font-medium tracking-[0.18em]" style={{ color: 'rgba(143,174,245,0.8)' }}>
        UNITS · MM
      </p>
      <p className="absolute bottom-4 left-10 font-mono text-[10px] font-medium tracking-[0.18em]" style={{ color: 'rgba(143,174,245,0.8)' }}>
        TOL ISO 2768-mK
      </p>
      <p className="absolute bottom-4 right-10 font-mono text-[10px] font-medium tracking-[0.18em]" style={{ color: 'rgba(143,174,245,0.8)' }}>
        SCALE 1:1
      </p>
    </div>
    <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 font-mono text-[10px] text-slate-400 backdrop-blur-sm">
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

const PrimaryLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
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

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: ACCENT_BLUE }}>
    {children}
  </p>
);

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
        @keyframes fq-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .fq-marquee { display: flex; width: max-content; animation: fq-scroll 48s linear infinite; }
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) {
          .fq-rise { animation: none; opacity: 1; }
          .fq-marquee { animation: none; }
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
              ['PROCESS', '#process'],
              ['MATERIALS', '#materials'],
              ['STANDARDS', '#standards'],
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
              Instant Quote
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative w-full" style={heroGrid}>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-white/[0.03] to-transparent"
          aria-hidden
        />
        <div className="relative mx-auto grid w-full max-w-[1720px] items-center gap-12 px-4 pb-16 pt-16 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-14 lg:pb-24 lg:pt-24">
          <div>
            <p
              className="fq-rise font-mono text-[11px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: ACCENT_BLUE, animationDelay: '0.05s' }}
            >
              Precision-Priced CNC Quoting
            </p>
            <h1
              className="fq-rise mt-5 font-display text-[2.4rem] font-bold leading-[1.1] tracking-tight text-white sm:text-5xl xl:text-[3.6rem]"
              style={{ animationDelay: '0.12s' }}
            >
              Engineering Precision.
              <br />
              <span style={{ color: HEADLINE_BLUE }}>Quoted in Seconds.</span>
            </h1>
            <p
              className="fq-rise mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg"
              style={{ animationDelay: '0.2s' }}
            >
              Upload your CAD files and get an instant, fully itemized quote for custom CNC
              machined parts — geometry measured, manufacturability checked, every rupee
              traceable from stock to inspection.
            </p>

            <div className="fq-rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: '0.28s' }}>
              <PrimaryLink to="/signup">
                Get Instant Quote
                <ArrowRight className="h-4 w-4" />
              </PrimaryLink>
              <a href="#process" className={BTN_OUTLINE}>
                Explore the Process
              </a>
            </div>
          </div>

          <div className="fq-rise" style={{ animationDelay: '0.25s' }}>
            <HeroViewport animate={animate} />
          </div>
        </div>
      </section>

      {/* Materials strip */}
      <section
        id="materials"
        className="w-full scroll-mt-20 border-y border-white/[0.06] py-6"
        style={{ backgroundColor: INK.band }}
      >
        <p className="px-4 text-center font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-slate-500">
          Materials &amp; finishes priced against 2026 India machining benchmarks
        </p>
        <div className="relative mt-4 overflow-hidden">
          <div className="fq-marquee">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {MATERIALS_TICKER.map((material) => (
                  <span
                    key={`${copy}-${material}`}
                    className="flex items-center font-mono text-[11px] font-medium tracking-[0.2em] text-slate-500"
                  >
                    <span className="px-6">{material}</span>
                    <span style={{ color: 'rgba(143,174,245,0.4)' }}>◦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process routing */}
      <section id="process" className="w-full scroll-mt-20">
        <div className="mx-auto w-full max-w-[1720px] px-4 py-16 sm:px-8 lg:px-14 lg:py-24">
          <Eyebrow>The Process</Eyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            From CAD File to Sent Quote
          </h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {ROUTING_STEPS.map(({ op, title, detail, icon: Icon }) => (
              <article
                key={op}
                className="rounded-lg border border-white/[0.08] p-6 transition-colors hover:border-white/20 lg:p-7"
                style={{ backgroundColor: INK.panel }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded border border-white/10 bg-white/5">
                  <Icon className="h-4 w-4" style={{ color: ACCENT_BLUE }} />
                </div>
                <p className="mt-5 font-mono text-[11px] font-semibold tracking-[0.18em]" style={{ color: ACCENT_BLUE }}>
                  {op}
                </p>
                <h3 className="mt-1.5 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Standards: checklist + live pipeline table */}
      <section id="standards" className="w-full scroll-mt-20 border-t border-white/[0.06]" style={{ backgroundColor: INK.band }}>
        <div className="mx-auto grid w-full max-w-[1720px] items-center gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-14 lg:py-24">
          <div>
            <Eyebrow>Uncompromising Numbers</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Why Choose ForgeQuote?
            </h2>

            <div className="mt-9 space-y-7">
              {STANDARDS.map(({ icon: Icon, title, detail }) => (
                <div key={title} className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5">
                    <Icon className="h-4 w-4" style={{ color: ACCENT_BLUE }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-slate-400">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live pipeline panel */}
          <div className="rounded-xl border border-white/[0.08] p-2.5" style={{ backgroundColor: INK.inset }}>
            <div className="overflow-hidden rounded-lg border border-white/[0.08]" style={{ backgroundColor: INK.panel }}>
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3">
                <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-slate-300">
                  QUOTE PIPELINE · REAL-TIME
                </p>
                <p className="hidden font-mono text-[10px] tracking-[0.16em] text-emerald-400 sm:block">
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

      {/* CTA */}
      <section className="w-full border-t border-white/[0.06]">
        <div className="mx-auto w-full max-w-[900px] px-4 py-20 text-center sm:px-8 lg:py-28">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Ready to quote your next build?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
            Create a workspace, upload a STEP file, and send your customer a fully itemized,
            branded quote today — free.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <PrimaryLink to="/signup">Upload CAD Files</PrimaryLink>
            <Link to="/login" className={BTN_OUTLINE}>
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-white/[0.08]" style={{ backgroundColor: INK.band }}>
        <div className="mx-auto grid w-full max-w-[1720px] gap-10 px-4 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.6fr_1fr_1fr] lg:px-14">
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
                ['The process', '#process'],
                ['Materials & finishes', '#materials'],
                ['Pricing standards', '#standards'],
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
