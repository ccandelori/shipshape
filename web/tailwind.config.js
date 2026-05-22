/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Linear-inspired neutral palette
        // All colors meet WCAG 2.1 AA contrast requirements (4.5:1 minimum)
        background: '#0d0d0d',
        foreground: '#f5f5f5',
        muted: '#8a8a8a', // Changed from #737373 (4.09:1) to #8a8a8a (5.1:1 contrast)
        // muted-soft: same family as muted, slightly brighter to replace the
        // de-emphasis effect of `text-muted/50` while keeping AA contrast.
        // #8a8a8a × 0.5 over #0d0d0d ≈ #4a4a4a (2.26:1, FAIL). Direct AA-passing
        // equivalent at #a8a8a8 = 6.8:1 over #0d0d0d.
        'muted-soft': '#a8a8a8',
        border: '#262626',
        accent: '#005ea2', // Logo blue
        'accent-hover': '#0071bc', // Lighter blue for hover
        // accent-soft: pre-blended replacement for `bg-accent/20` (which renders
        // as ~#15252f at 2.55:1 against bg — FAIL when text-foreground sits on
        // top). #15314a is the same "tinted with accent" look as a real color;
        // text-foreground on it = 13.6:1 (AAA easy).
        'accent-soft': '#15314a',
        // accent-fg: foreground-only variant for `text-accent` on dark bg.
        // #005ea2 on #0d0d0d = 2.82:1 (FAIL); #5fa5d3 = 6.4:1 (AA pass).
        // Use `text-accent-fg` anywhere text-accent appears as a foreground
        // color on background; keep `bg-accent` + `text-white` combos as-is.
        'accent-fg': '#5fa5d3',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
