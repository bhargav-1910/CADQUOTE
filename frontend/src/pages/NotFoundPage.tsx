import { Link } from 'react-router-dom';
import { ArrowRight, Box, Compass, FileQuestion } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import LegalFooter from '@/components/LegalFooter';

// Same blueprint-grid texture as the landing hero and auth pages, so a
// broken link still feels like the same product rather than a dead end.
const blueprintGrid = {
  backgroundImage:
    'linear-gradient(to right, rgba(143,174,245,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(143,174,245,0.05) 1px, transparent 1px)',
  backgroundSize: '36px 36px',
};

const NotFoundPage = () => {
  const { user } = useAuth();
  const homeHref = user ? '/workspace' : '/';
  const homeLabel = user ? 'Back to dashboard' : 'Back to homepage';

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden bg-[#0A0A0C] p-4 pb-20 sm:p-6 sm:pb-20"
      style={blueprintGrid}
    >
      <div className="mx-auto w-full max-w-lg text-center">
        <Link to={homeHref} className="mb-8 inline-flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white">
            <Box className="h-5 w-5" />
          </span>
          <span className="font-display text-2xl text-white">ForgeQuote</span>
        </Link>

        <div className="rounded-2xl border border-slate-800 bg-[#0E0E11] p-10 shadow-2xl shadow-black/60">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-800 bg-[#131317] text-[#8FAEF5]">
            <FileQuestion className="h-8 w-8" />
          </div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#8FAEF5]">
            ERR-404 // Route not found
          </p>
          <h1 className="mt-3 font-display text-4xl text-white">Page not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            The page you're looking for doesn't exist, moved, or the link you followed is out of
            date — a quote share link that's since expired, for example.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to={homeHref}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F2A35E] px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-[#f0b17a]"
            >
              {homeLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {user && (
              <Link
                to="/quotes"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800/60"
              >
                <Compass className="h-4 w-4" />
                Browse my quotes
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10 w-full max-w-lg">
        <LegalFooter compact />
      </div>
    </div>
  );
};

export default NotFoundPage;
