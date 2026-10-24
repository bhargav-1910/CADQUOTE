/** @type {import('tailwindcss').Config} */

// Semantic tokens are RGB channel triplets defined in index.css for light and
// `.dark`, so `bg-surface/80`-style opacity modifiers keep working. Any element
// with the `dark` class (the whole app in dark mode, or an always-dark region
// like the landing hero) resolves them to their dark values.
const token = (name) => `rgb(var(--fq-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Radius scale: 8 / 12 / 16 plus pills. Nothing else exists on purpose.
    borderRadius: {
      none: '0px',
      DEFAULT: '8px',
      lg: '8px',
      xl: '12px',
      '2xl': '16px',
      full: '9999px',
    },
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          muted: token('surface-muted'),
          raised: token('surface-raised'),
        },
        fill: {
          DEFAULT: token('fill'),
          strong: token('edge-strong'),
        },
        ink: {
          DEFAULT: token('ink'),
          secondary: token('ink-secondary'),
          muted: token('ink-muted'),
          subtle: token('ink-subtle'),
        },
        edge: {
          DEFAULT: token('edge'),
          strong: token('edge-strong'),
        },
        // The one interactive blue (Tailwind sky values).
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        // Machined orange: reserved for the single highest-value CTA.
        accent: {
          50: '#fef7ee',
          100: '#fdecd8',
          200: '#fad5b0',
          300: '#f6bd85',
          400: '#f2a35e',
          500: '#ea8837',
          600: '#db6f22',
          700: '#b6561e',
          800: '#91451f',
          900: '#753a1c',
          950: '#3f1c0c',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      // One motion rhythm app-wide: `transition` / `duration-*` default to it.
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
  plugins: [],
}
