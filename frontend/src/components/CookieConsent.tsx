import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import {
  ALL_ACCEPTED,
  ConsentPreferences,
  ESSENTIAL_ONLY,
  needsDecision,
  readConsent,
  saveConsent,
} from '@/legal/consent';
import { useLegalInfo } from '@/legal/useLegalInfo';
import { buttonClasses } from '@/components/ui';

/** Footer links dispatch this to reopen the panel after a decision was made. */
export const COOKIE_PREFERENCES_EVENT = 'consent:open-preferences';

interface CategoryProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (value: boolean) => void;
}

const Category = ({ id, title, description, checked, locked, onChange }: CategoryProps) => (
  <div className="flex items-start gap-3 rounded-lg border border-edge bg-surface-muted p-3">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={locked}
      onChange={(event) => onChange?.(event.target.checked)}
      className="mt-1 h-4 w-4 shrink-0 accent-primary-500 disabled:opacity-60"
    />
    <label htmlFor={id} className="cursor-pointer">
      <span className="block text-sm font-semibold text-ink">
        {title}
        {locked && <span className="ml-2 text-xs font-medium text-ink-muted">Always on</span>}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-ink-muted">{description}</span>
    </label>
  </div>
);

const CookieConsent = () => {
  const info = useLegalInfo();
  const [visible, setVisible] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ConsentPreferences>(ESSENTIAL_ONLY);

  // The banner can only be evaluated once the live policy version is known,
  // otherwise a version bump would not re-prompt.
  useEffect(() => {
    if (needsDecision(info.policy_version)) {
      setVisible(true);
    }
  }, [info.policy_version]);

  useEffect(() => {
    const onOpenPreferences = () => {
      const stored = readConsent();
      setDraft(
        stored
          ? {
              necessary: true,
              preferences: stored.preferences,
              analytics: stored.analytics,
              marketing: stored.marketing,
            }
          : ESSENTIAL_ONLY,
      );
      setShowDetail(true);
      setVisible(true);
    };

    window.addEventListener(COOKIE_PREFERENCES_EVENT, onOpenPreferences);
    return () => window.removeEventListener(COOKIE_PREFERENCES_EVENT, onOpenPreferences);
  }, []);

  const commit = useCallback(
    async (preferences: ConsentPreferences, source: 'banner' | 'preferences') => {
      setSaving(true);
      try {
        await saveConsent(preferences, info.policy_version, source);
      } finally {
        setSaving(false);
        setVisible(false);
        setShowDetail(false);
      }
    },
    [info.policy_version],
  );

  // Reserve the banner's height at the bottom of the page so it never sits
  // on top of content (e.g. the sign-in button on a phone).
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const banner = bannerRef.current;
    if (!visible || !banner) return;
    const observer = new ResizeObserver(() => {
      document.body.style.paddingBottom = `${banner.offsetHeight}px`;
    });
    observer.observe(banner);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = '';
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
    >
      <div
        className="mx-auto w-full max-w-3xl rounded-2xl border border-edge bg-surface p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-300 sm:flex"
          >
            <Cookie className="h-4.5 w-4.5" />
          </span>

          <div className="min-w-0 flex-1">
            <h2 id="cookie-consent-title" className="text-lg font-semibold text-ink">
              Cookies on {info.app_name}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
              We use strictly necessary storage to keep you signed in. Anything beyond that is
              optional and off unless you turn it on. Read our{' '}
              <Link to="/legal/cookies" className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300">
                Cookie Policy
              </Link>{' '}
              and{' '}
              <Link to="/legal/privacy" className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300">
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          {/* Dismiss is deliberately absent until a choice is made: closing
              without deciding would leave consent undefined. */}
          {showDetail && (
            <button
              type="button"
              onClick={() => setShowDetail(false)}
              aria-label="Close preferences"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface-raised hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showDetail && (
          <div className="mt-4 space-y-2.5">
            <Category
              id="consent-necessary"
              title="Strictly necessary"
              description="Sign-in session, security and your consent record. Required for the app to work."
              checked
              locked
            />
            <Category
              id="consent-preferences"
              title="Preferences"
              description="Remembers interface choices such as dismissed onboarding steps."
              checked={draft.preferences}
              onChange={(value) => setDraft((prev) => ({ ...prev, preferences: value }))}
            />
            <Category
              id="consent-analytics"
              title="Analytics"
              description="Aggregate usage measurement to improve the product. Not currently in use."
              checked={draft.analytics}
              onChange={(value) => setDraft((prev) => ({ ...prev, analytics: value }))}
            />
            <Category
              id="consent-marketing"
              title="Marketing"
              description="Advertising and cross-site tracking. We do not use these."
              checked={draft.marketing}
              onChange={(value) => setDraft((prev) => ({ ...prev, marketing: value }))}
            />
          </div>
        )}

        {/* Phone: Reject | Accept side by side, preferences as a link below. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:justify-end">
          {showDetail ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => commit(draft, 'preferences')}
              className={buttonClasses('secondary', 'md', 'order-last col-span-2 sm:order-none')}
            >
              Save preferences
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowDetail(true)}
              className={buttonClasses('ghost', 'md', 'order-last col-span-2 sm:order-none sm:mr-auto')}
            >
              Manage preferences
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => commit(ESSENTIAL_ONLY, showDetail ? 'preferences' : 'banner')}
            className={buttonClasses('secondary', 'md')}
          >
            Reject non-essential
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => commit(ALL_ACCEPTED, showDetail ? 'preferences' : 'banner')}
            className={buttonClasses('accent', 'md')}
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
