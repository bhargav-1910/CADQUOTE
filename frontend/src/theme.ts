import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';

// Until someone picks Light or Dark, the app matches the device. The old
// `fq-theme` key stored 'light' for everyone by default, so only an explicit
// 'dark' there is carried over. public/theme-init.js mirrors this logic to
// set the class before first paint.
const KEY = 'fq-appearance';
const LEGACY_KEY = 'fq-theme';

const media = window.matchMedia('(prefers-color-scheme: dark)');

const readStoredTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark') return value;
    return localStorage.getItem(LEGACY_KEY) === 'dark' ? 'dark' : null;
  } catch {
    return null;
  }
};

export const currentTheme = (): Theme => readStoredTheme() ?? (media.matches ? 'dark' : 'light');

const applyTheme = (theme: Theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

// Follow an OS-level switch only while no explicit choice has been made.
media.addEventListener('change', () => {
  if (!readStoredTheme()) applyTheme(currentTheme());
});

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice just won't persist.
    }
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'), [setTheme]);

  return { theme, setTheme, toggle };
};
