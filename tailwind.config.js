/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#07090f',
          900: '#0b0e17',
          850: '#10141f',
          800: '#161b28',
          700: '#222939',
          600: '#333c52',
        },
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scan: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(244,63,94,0.4)' },
          '70%': { boxShadow: '0 0 0 12px rgba(244,63,94,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(244,63,94,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        scan: 'scan 1.6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
}