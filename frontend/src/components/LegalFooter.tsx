import { Link } from 'react-router-dom';
import { LEGAL_NAV } from '@/legal/content';
import { useLegalInfo } from '@/legal/useLegalInfo';
import { COOKIE_PREFERENCES_EVENT } from './CookieConsent';

/**
 * Policy links shown on the landing page, the workspace and the auth screens,
 * so the required documents are reachable from everywhere in the product.
 */
const LegalFooter = ({ compact = false }: { compact?: boolean }) => {
  const info = useLegalInfo();

  const openPreferences = () => {
    window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT));
  };

  const links = (
    <>
      {LEGAL_NAV.map((item) => (
        <Link
          key={item.slug}
          to={`/legal/${item.slug}`}
          className="text-ink-muted transition hover:text-ink"
        >
          {item.title}
        </Link>
      ))}
      <button
        type="button"
        onClick={openPreferences}
        className="text-left text-ink-muted underline-offset-2 transition hover:text-ink hover:underline"
      >
        Cookie preferences
      </button>
    </>
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">{links}</div>
    );
  }

  return (
    <footer className="border-t border-edge">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-4 py-6 text-xs sm:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{links}</div>
        <p className="text-ink-muted">
          © {new Date().getFullYear()} {info.company_name} — All rights reserved
        </p>
      </div>
    </footer>
  );
};

export default LegalFooter;
