import { useCallback, useEffect, useState } from 'react';
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

/** Footer links dispatch this to reopen the panel after a decision was made. */
export const COOKIE_PREFERENCES_EVENT = 'consent:open-preferences';

const INK = { panel: '#0E0E11', inset: '#0A0A0D' };
const ACCENT_BLUE = '#8FAEF5';

interface CategoryProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (value: boolean) => void;
}

const Category = ({ id, title, description, checked, locked, onChange }: CategoryProps) => (
  <div className="flex items-start gap-3 rounded-lg border border-white/[0.07] p-3" style={{ backgroundColor: INK.inset }}>
    <input
      id={id}
      type="checkbox"
      checked={checked}
      disabled={locked}
      onChange={(event) => onChange?.(event.target.checked)}
      className="mt-1 h-4 w-4 shrink-0 accent-sky-500 disabled:opacity-60"
    />
    <label htmlFor={id} className="cursor-pointer">
      <span className="block text-sm font-semibold text-white">
        {title}
        {locked && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Always on</span>}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-slate-400">{description}</span>
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

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
    >
      <div
        className="mx-auto w-full max-w-3xl rounded-2xl border border-white/[0.1] p-5 shadow-2xl shadow-black/70 sm:p-6"
        style={{ backgroundColor: INK.panel }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(143,174,245,0.12)', color: ACCENT_BLUE }}
          >
            <Cookie className="h-4.5 w-4.5" />
          </span>

          <div className="min-w-0 flex-1">
            <h2 id="cookie-consent-title" className="font-display text-lg text-white">
              Cookies on {info.app_name}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              We use strictly necessary storage to keep you signed in. Anything beyond that is
              optional and off unless you turn it on. Read our{' '}
              <Link to="/legal/cookies" className="text-sky-300 underline-offset-2 hover:underline">
                Cookie Policy
              </Link>{' '}
              and{' '}
              <Link to="/legal/privacy" className="text-sky-300 underline-offset-2 hover:underline">
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
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
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

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {showDetail ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => commit(draft, 'preferences')}
              className="rounded-lg border border-white/[0.12] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-60"
            >
              Save preferences
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowDetail(true)}
              className="rounded-lg border border-white/[0.12] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-60"
            >
              Manage preferences
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => commit(ESSENTIAL_ONLY, showDetail ? 'preferences' : 'banner')}
            className="rounded-lg border border-white/[0.12] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-60"
          >
            Reject non-essential
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => commit(ALL_ACCEPTED, showDetail ? 'preferences' : 'banner')}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[#0A0A0D] transition hover:brightness-110 disabled:opacity-60"
            style={{ backgroundColor: '#F2A35E' }}
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
