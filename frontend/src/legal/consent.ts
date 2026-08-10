/**
 * Cookie consent state.
 *
 * The decision is kept in first-party local storage so the banner is not shown
 * again, and mirrored to the backend as an auditable record. Strictly
 * necessary storage is always on — it is what keeps you signed in — and the
 * policy pages say so explicitly.
 */
import { recordConsent } from '@/services/api';

export const CONSENT_STORAGE_KEY = 'forgequote.consent';
export const CONSENT_SUBJECT_KEY = 'forgequote.consent.id';
export const CONSENT_CHANGED_EVENT = 'consent:changed';

export interface ConsentPreferences {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
}

export interface StoredConsent extends ConsentPreferences {
  policyVersion: string;
  decidedAt: string;
}

export const ALL_ACCEPTED: ConsentPreferences = {
  necessary: true,
  preferences: true,
  analytics: true,
  marketing: true,
};

export const ESSENTIAL_ONLY: ConsentPreferences = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

/** Opaque, non-identifying id linking the browser's choice to our audit row. */
export const getSubjectKey = (): string => {
  try {
    const existing = localStorage.getItem(CONSENT_SUBJECT_KEY);
    if (existing) return existing;
    // crypto.randomUUID needs a secure context; fall back for plain-http dev.
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(CONSENT_SUBJECT_KEY, generated);
    return generated;
  } catch {
    // Private mode with storage disabled: consent still works for this page view.
    return 'ephemeral-' + Date.now().toString(36);
  }
};

export const readConsent = (): StoredConsent | null => {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      necessary: true,
      preferences: Boolean(parsed.preferences),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      policyVersion: String(parsed.policyVersion ?? ''),
      decidedAt: String(parsed.decidedAt ?? ''),
    };
  } catch {
    return null;
  }
};

/** Persist locally, notify listeners, then record server-side (best effort). */
export const saveConsent = async (
  preferences: ConsentPreferences,
  policyVersion: string,
  source: 'banner' | 'preferences' = 'banner',
): Promise<void> => {
  const stored: StoredConsent = {
    ...preferences,
    necessary: true,
    policyVersion,
    decidedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* storage unavailable — the audit record below still captures the choice */
  }

  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: stored }));

  try {
    await recordConsent({
      subject_key: getSubjectKey(),
      policy_version: policyVersion,
      preferences: preferences.preferences,
      analytics: preferences.analytics,
      marketing: preferences.marketing,
      source,
    });
  } catch {
    // Never block the UI on the audit write; the local decision is authoritative
    // for what the app does next.
  }
};

/** True when the stored decision predates the current policy version. */
export const needsDecision = (policyVersion: string): boolean => {
  const stored = readConsent();
  return !stored || stored.policyVersion !== policyVersion;
};
