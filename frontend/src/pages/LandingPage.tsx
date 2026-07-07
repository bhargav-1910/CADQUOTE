import { Link } from 'react-router-dom';
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

const LandingPage = () => {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#eef1f5] text-slate-900">
      {/* Header */}
      <header className="w-full border-b border-slate-200/80 bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="w-full px-4 sm:px-8 lg:px-14 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-semibold text-slate-900 leading-none">ForgeQuote</p>
              <p className="text-[11px] text-slate-500 leading-none mt-1">CNC Cost Studio</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Create workspace
            </Link>
          </div>
        </div>
      </header>

      {/* Hero on blueprint grid */}
      <section className="relative w-full" style={blueprintGrid}>
        <div className="w-full px-4 sm:px-8 lg:px-14 pt-14 pb-16 lg:pt-20 lg:pb-24 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] items-center max-w-[1720px] mx-auto">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold tracking-wide text-sky-700">
              <Gauge className="w-3.5 h-3.5" />
              For CNC job shops and precision component suppliers
            </p>
            <h1 className="mt-5 font-display text-[2.6rem] leading-[1.05] sm:text-6xl xl:text-7xl font-semibold tracking-tight text-slate-900">
              A STEP file goes in.
              <br />
              A <span className="text-sky-700">priced, defensible quote</span> comes out.
            </h1>
            <p className="mt-6 max-w-2xl text-base sm:text-lg text-slate-600 leading-relaxed">
              ForgeQuote measures the geometry, checks manufacturability, prices every operation
              from stock to inspection, and emails your customer a branded PDF — in the time it
              takes to open a spreadsheet.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-sky-600/25 transition hover:bg-sky-700 hover:shadow-sky-600/35"
              >
                Start quoting free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/70 px-6 py-3.5 font-semibold text-slate-700 transition hover:bg-white"
              >
                Sign in
              </Link>
            </div>

            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
              {[
                ['STEP · STL', 'file formats, parsed exactly'],
                ['< 60 sec', 'from upload to full price'],
                ['₹ INR', 'India machining benchmarks'],
                ['10+ checks', 'DFM rules, each one costed'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-mono text-xl font-semibold text-slate-900">{value}</dt>
                  <dd className="text-xs text-slate-500 mt-0.5">{label}</dd>
                </div>
              ))}
            </dl>
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
                  <p className="text-[11px] text-slate-400">Valid until 21 Jul 2026</p>
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

      {/* Routing sheet: how it works */}
      <section className="w-full bg-white border-y border-slate-200">
        <div className="w-full px-4 sm:px-8 lg:px-14 py-14 lg:py-20 max-w-[1720px] mx-auto">
          <p className="font-mono text-xs font-semibold tracking-[0.2em] text-sky-700 uppercase">Process routing</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-slate-900">
            From raw CAD to delivered quote, one routing sheet.
          </h2>

          <div className="mt-10 grid gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200 md:grid-cols-4">
            {ROUTING_STEPS.map(({ op, title, detail, icon: Icon }) => (
              <div key={op} className="bg-white p-6 lg:p-8 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-slate-400">{op}</span>
                  <Icon className="w-5 h-5 text-sky-600" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900 text-lg">{title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="w-full" style={blueprintGrid}>
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
      <section className="w-full bg-slate-900 text-white">
        <div className="w-full px-4 sm:px-8 lg:px-14 py-14 lg:py-16 max-w-[1720px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="font-mono text-xs font-semibold tracking-[0.2em] text-sky-400 uppercase">No spreadsheets were harmed</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-semibold">
              Quote the next RFQ in under a minute.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
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

      <footer className="w-full bg-slate-950 text-slate-500">
        <div className="w-full px-4 sm:px-8 lg:px-14 py-6 max-w-[1720px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <p>ForgeQuote — CNC Cost Studio</p>
          <p className="font-mono">STEP · STL &nbsp;|&nbsp; DFM-priced &nbsp;|&nbsp; INR benchmarks</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
