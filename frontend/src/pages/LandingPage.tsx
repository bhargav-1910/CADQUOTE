import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Factory,
  Gauge,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  FileCheck2,
  Send,
  LineChart,
} from 'lucide-react';

const LandingPage = () => {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-[#f7f4ec] via-[#f3efe3] to-[#ece7dc] text-slate-900">
      <div className="absolute inset-0 -z-10 opacity-80">
        <div className="absolute left-[-12rem] top-[-10rem] h-[30rem] w-[30rem] rounded-full bg-[#f59e0b]/25 blur-3xl" />
        <div className="absolute right-[-12rem] top-[4rem] h-[26rem] w-[26rem] rounded-full bg-[#0891b2]/25 blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-7">
        <div className="min-w-0">
          <p className="font-display text-2xl tracking-tight text-slate-900">ForgeQuote</p>
          <p className="text-xs text-slate-600">Manufacturing Quotation Intelligence</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link to="/login" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white">
            Login
          </Link>
          <Link to="/signup" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700">
            Sign up
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-10 sm:px-7 sm:pb-14">
        <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-xl shadow-slate-300/50 backdrop-blur md:grid-cols-[1.2fr,0.8fr] md:p-9">
          <div>
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-700">Built for CNC, Fabrication, and Rapid Manufacturing Teams</p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight text-slate-900 sm:text-5xl md:text-6xl">
              Win RFQs faster with consistent, profit-safe quoting.
            </h1>
            <p className="mt-5 max-w-2xl text-base text-slate-600 sm:text-lg">
              ForgeQuote turns CAD files into customer-ready quotes with controlled pricing logic, manufacturability signals, and branded PDF delivery. Stop losing time in spreadsheets and manual revisions.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700">
                Create account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-100">
                Sign in
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Avg quote turnaround</p>
                <p className="font-semibold text-slate-900">&lt; 30 min</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Margin governance</p>
                <p className="font-semibold text-slate-900">Rule-based</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">CAD support</p>
                <p className="font-semibold text-slate-900">STEP/STP/STL</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Output</p>
                <p className="font-semibold text-slate-900">PDF + Email</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <UploadCloud className="mt-0.5 h-5 w-5 text-sky-700" />
              <div>
                <p className="font-semibold text-slate-900">CAD Ingestion</p>
                <p className="text-sm text-slate-600">STEP, STP, STL upload with automatic geometry extraction.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <Gauge className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="font-semibold text-slate-900">DFX-aware Estimation</p>
                <p className="text-sm text-slate-600">Complexity and geometry signals included before final pricing.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
              <div>
                <p className="font-semibold text-slate-900">Secure Access</p>
                <p className="text-sm text-slate-600">JWT + refresh tokens with per-user data ownership.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <Send className="mt-0.5 h-5 w-5 text-rose-700" />
              <div>
                <p className="font-semibold text-slate-900">Customer Delivery</p>
                <p className="text-sm text-slate-600">Auto-email branded quote PDFs directly to customer contacts.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white/90 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-slate-700">
            <Sparkles className="h-5 w-5 text-cyan-700" />
            <p className="text-sm font-semibold tracking-wide">How It Works</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <UploadCloud className="h-5 w-5 text-sky-700" />
              <p className="mt-2 font-semibold text-slate-900">1. Upload CAD</p>
              <p className="mt-1 text-sm text-slate-600">Import customer files and queue geometry processing.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <FileCheck2 className="h-5 w-5 text-amber-700" />
              <p className="mt-2 font-semibold text-slate-900">2. Configure Job</p>
              <p className="mt-1 text-sm text-slate-600">Apply material, finish, quantity, and inspection policies.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <LineChart className="h-5 w-5 text-emerald-700" />
              <p className="mt-2 font-semibold text-slate-900">3. Review Price</p>
              <p className="mt-1 text-sm text-slate-600">Get transparent cost components and lead-time estimate.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Send className="h-5 w-5 text-rose-700" />
              <p className="mt-2 font-semibold text-slate-900">4. Deliver Quote</p>
              <p className="mt-1 text-sm text-slate-600">Generate PDF and send to customer in one controlled flow.</p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <Factory className="h-5 w-5 text-sky-700" />
            <h2 className="mt-3 font-semibold text-slate-900">Manufacturing-first</h2>
            <p className="mt-1 text-sm text-slate-600">Designed for job shops and precision component suppliers.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            <h2 className="mt-3 font-semibold text-slate-900">Operational consistency</h2>
            <p className="mt-1 text-sm text-slate-600">Reduce quoting variation across estimators and shifts.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <LockKeyhole className="h-5 w-5 text-emerald-700" />
            <h2 className="mt-3 font-semibold text-slate-900">Secure by default</h2>
            <p className="mt-1 text-sm text-slate-600">Authentication, token refresh, and isolated user records.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5">
            <LineChart className="h-5 w-5 text-indigo-700" />
            <h2 className="mt-3 font-semibold text-slate-900">Margin visibility</h2>
            <p className="mt-1 text-sm text-slate-600">Track pricing levers and protect profitability per quote.</p>
          </article>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-slate-300">Ready to accelerate your quotation process?</p>
            <h2 className="mt-1 font-display text-3xl">Start your ForgeQuote workspace today.</h2>
          </div>
          <div className="flex gap-3">
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-white transition hover:bg-cyan-600">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-xl border border-slate-500 px-5 py-3 font-semibold text-slate-100 transition hover:bg-slate-800">
              Login
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LandingPage;
