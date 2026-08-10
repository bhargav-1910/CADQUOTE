/**
 * Loads the configuration-driven values used by the policy pages.
 *
 * Cached at module level: the values change only on redeploy, so every page
 * that needs them shares one request. Falls back to compiled-in defaults so a
 * policy page always renders, even offline.
 */
import { useEffect, useState } from 'react';
import { getLegalInfo } from '@/services/api';
import { DEFAULT_LEGAL_INFO, LegalInfo } from './content';

let cached: LegalInfo | null = null;
let inFlight: Promise<LegalInfo> | null = null;

const load = (): Promise<LegalInfo> => {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = getLegalInfo()
      .then((info) => {
        cached = info;
        return info;
      })
      .catch(() => DEFAULT_LEGAL_INFO)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};

export const useLegalInfo = (): LegalInfo => {
  const [info, setInfo] = useState<LegalInfo>(cached ?? DEFAULT_LEGAL_INFO);

  useEffect(() => {
    let active = true;
    load().then((next) => {
      if (active) setInfo(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return info;
};
