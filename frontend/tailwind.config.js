/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (CSS variables defined in index.css; theme-aware)
        surface: {
          DEFAULT: 'var(--fq-surface)',
          muted: 'var(--fq-surface-muted)',
          raised: 'var(--fq-surface-raised)',
        },
        ink: {
          DEFAULT: 'var(--fq-ink)',
          secondary: 'var(--fq-ink-secondary)',
          muted: 'var(--fq-ink-muted)',
        },
        edge: 'var(--fq-border)',
        // Single brand blue: primary === Tailwind sky, so legacy `primary-*`
        // and `sky-*` classes render the same color everywhere.
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
        // Machined-orange CTA accent from the landing page (#F2A35E).
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
        display: ['"Space Grotesk"', '"IBM Plex Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
