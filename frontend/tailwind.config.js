import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / var(--surface-alpha, 1))',
        card: 'rgb(var(--surface) / var(--surface-alpha, 1))',
        panel: 'rgb(var(--panel) / var(--panel-alpha, 1))',
        subtle: 'rgb(var(--subtle) / var(--subtle-alpha, 1))',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-light': 'rgb(var(--ink-light) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink) / <alpha-value>)',
        'accent-wash': 'rgb(var(--accent-wash) / var(--accent-wash-alpha, 1))',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        err: 'rgb(var(--err) / <alpha-value>)',
      },
      keyframes: {
        'page-turn': {
          '0%': { transform: 'rotateY(0deg)', opacity: '1' },
          '50%': { transform: 'rotateY(-8deg)', opacity: '0.7' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        'chapter-card-in': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'chunk-gather': {
          '0%': { transform: 'scale(0.8) translate(var(--tw-translate-x, 0), var(--tw-translate-y, 0))', opacity: '0' },
          '100%': { transform: 'scale(1) translate(0, 0)', opacity: '1' },
        },
        'tag-fade-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-dot-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(var(--brand) / 0.4)' },
          '50%': { boxShadow: '0 0 0 6px rgb(var(--brand) / 0)' },
        },
      },
      animation: {
        'page-turn': 'page-turn 1.8s ease-in-out infinite',
        'chapter-card-in': 'chapter-card-in 0.4s ease-out forwards',
        'chunk-gather': 'chunk-gather 0.5s ease-out forwards',
        'tag-fade-in': 'tag-fade-in 0.3s ease-out forwards',
        'pulse-dot-glow': 'pulse-dot-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [typography],
};