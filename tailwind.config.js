/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // The Babe Studio - Luxury Biotech Theme
        'theme-bg': '#FFFFFF',           // Pure White
        'theme-text': '#1E1E1E',         // Luxury Dark text

        // Primary Palette - Sakura cerise (brown accent removed)
        'brand': {
          DEFAULT: '#D6446F', // Cerise rose
          50: '#FBF1F5',
          100: '#FBE4EC',
          200: '#F4DCE4',
          300: '#E87BA0',
          400: '#D6446F',     // Primary cerise
          500: '#B0335A',
          600: '#B0335A',
          700: '#8E2A49',
          800: '#6E2038',
          900: '#1E0E16',
        },

        // Secondary & Neutral
        'charcoal': {
          DEFAULT: '#1E1E1E',
          50: '#F7F7F7',      // Soft Gray
          100: '#EEEEEE',
          200: '#D9D9D9',
          300: '#B0B0B0',
          400: '#858585',
          500: '#595959',
          600: '#4D4D4D',
          700: '#3D3D3D',
          800: '#2E2E2E',
          900: '#1E1E1E',     // Luxury Dark
        },

        // Backgrounds & Accents
        'cream': '#FFFFFF',
        'blush-light': '#F4E3DA', // Light Rose Accent
        'warm-white': '#FDFDFD',

        // Pure Peps — Sakura group-buy theme
        'sakura': {
          canvas: '#FBF8F6',     // warm near-white page background
          ink: '#17100D',        // near-black ink
          primary: '#D6446F',    // confident cerise-rose accent
          deep: '#B0335A',       // deep cerise (hover / labels)
          dark: '#1E0E16',       // dark dramatic panels
          light: '#E87BA0',      // soft pink
          blush: '#FBE4EC',      // blush tint
          'blush-soft': '#FBF1F5',
          mist: '#F4DCE4',       // faint blossom watermark
          edge: '#F1CEDB',       // blush border
          sage: '#1E7A5C',       // verified / savings semantic
          'sage-soft': '#E7F4EC',
          muted: '#5C5350',      // body gray
          faint: '#9A908C',      // tertiary gray
          soft: '#B79BA4',       // mono label gray
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Playfair Display', 'serif'],
        serif: ['Playfair Display', 'serif'],
        // Pure Peps display + technical/mono stacks
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Manrope', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'DEFAULT': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02)',
        // Soft white card shadow
        'soft': '0 4px 20px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.02)',
        'luxury': '0 8px 30px rgba(0, 0, 0, 0.08), 0 4px 10px rgba(0, 0, 0, 0.04)',
      },
      borderRadius: {
        'none': '0',
        'sm': '0.25rem',
        'DEFAULT': '0.5rem',
        'md': '0.75rem',
        'lg': '1rem',
        'xl': '1.25rem',
        '2xl': '1.5rem',
        'full': '9999px',
      },
      animation: {
        'fadeIn': 'fadeIn 0.6s ease-out',
        'slideUp': 'slideUp 0.5s ease-out',
        'float': 'float 6s ease-in-out infinite',
        'pp-pulse': 'ppPulse 2.4s ease-out infinite',
      },
      keyframes: {
        ppPulse: {
          '0%': { transform: 'scale(1)', opacity: '0.85' },
          '70%': { transform: 'scale(2.8)', opacity: '0' },
          '100%': { transform: 'scale(2.8)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
