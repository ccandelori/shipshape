/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Body / shell — cool slate background; cards float on top.
        slate: {
          50: '#F4F5F8',
          100: '#E7EAF1',
          200: '#D5DAE6',
          300: '#BFC5D5',
          400: '#A8AFC2',
          500: '#8E96AC',
          600: '#737B92',
          700: '#5A6178',
          800: '#3F4458',
          900: '#272B3A',
        },
        // Card surfaces — warm off-white (cream undertone).
        cream: {
          DEFAULT: '#F6F4EE',
          soft: '#FAF8F3',
          ring: '#EDEAE2',
        },
        // Primary ink — near-black with cool undertone.
        ink: {
          50: '#F5F6FA',
          100: '#E7EAF1',
          200: '#C8CDDB',
          300: '#9CA3B8',
          400: '#6C7387',
          500: '#494F62',
          600: '#2F3445',
          700: '#1B2030',
          800: '#101524',
          900: '#0A0E1A',
        },
        // Accent warm — coral (the "Paid" / Senior / heat color).
        coral: {
          50: '#FFF0EC',
          100: '#FFD7CC',
          400: '#FF8870',
          500: '#FF6E52',
          600: '#E85539',
        },
        // Accent cool — soft sky (chart dots, secondary highlight).
        sky: {
          100: '#DDEAF9',
          300: '#9CC3EA',
          500: '#5E9AD8',
          600: '#3E7EBF',
        },
        // Status — semantic mapping. PASS = ink-700 (dark/calm), FAIL = coral, SKIP = slate-400.
        pass: {
          DEFAULT: '#1B2030',
          soft: 'rgba(27, 32, 48, 0.06)',
          ring: 'rgba(27, 32, 48, 0.2)',
        },
        fail: {
          DEFAULT: '#FF6E52',
          soft: 'rgba(255, 110, 82, 0.10)',
          ring: 'rgba(255, 110, 82, 0.35)',
        },
        skip: {
          DEFAULT: '#A8AFC2',
          soft: 'rgba(168, 175, 194, 0.14)',
          ring: 'rgba(168, 175, 194, 0.35)',
        },
        accent: {
          DEFAULT: '#FF6E52', // alias for coral-500 — used in CTAs / live pill
          soft: '#FFF0EC',
          ring: 'rgba(255, 110, 82, 0.35)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        'mega': ['5rem', { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '700' }],
        'hero': ['3rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '600' }],
      },
      borderRadius: {
        'card': '1.5rem',  // 24px
        'tile': '1.25rem', // 20px
        'chip': '999px',
      },
      boxShadow: {
        // Soft, subtle, single-direction.
        'tile': '0 1px 2px rgba(20, 27, 50, 0.04), 0 4px 16px rgba(20, 27, 50, 0.05)',
        'tile-hover': '0 2px 4px rgba(20, 27, 50, 0.06), 0 12px 28px rgba(20, 27, 50, 0.08)',
        'tooltip': '0 8px 24px rgba(20, 27, 50, 0.18)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
