import { Link } from 'react-router-dom';
import { ArrowRight, Box, Compass, FileQuestion } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import LegalFooter from '@/components/LegalFooter';
import { buttonClasses } from '@/components/ui';


const NotFoundPage = () => {
  const { user } = useAuth();
  const homeHref = user ? '/workspace' : '/';
  const homeLabel = user ? 'Back to dashboard' : 'Back to homepage';

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden p-4 pb-20 sm:p-6 sm:pb-20"
    >
      <div className="mx-auto w-full max-w-lg text-center">
        <Link to={homeHref} className="mb-8 inline-flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white">
            <Box className="h-5 w-5" />
          </span>
          <span className="text-2xl text-ink">ForgeQuote</span>
        </Link>

        <div className="rounded-2xl border border-edge bg-surface p-10 shadow-xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-edge bg-surface-raised text-primary-700 dark:text-primary-300">
            <FileQuestion className="h-8 w-8" />
          </div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300">
            ERR-404 // Route not found
          </p>
          <h1 className="mt-3 text-4xl text-ink">Page not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-subtle">
            The page you're looking for doesn't exist, moved, or the link you followed is out of
            date — a quote share link that's since expired, for example.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to={homeHref}
              className={buttonClasses('accent', 'md')}
            >
              {homeLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {user && (
              <Link
                to="/quotes"
                className={buttonClasses('secondary', 'md')}
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
