
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['Outfit', 'sans-serif'],
        headline: ['Outfit', 'sans-serif'],
        code: ['JetBrains Mono', 'monospace'],
        display: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: '#000000',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#0058be',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#f3f4f5',
          foreground: '#47464b',
        },
        accent: {
          DEFAULT: '#e3e1ec',
          foreground: '#1a1b22',
        },
        destructive: {
          DEFAULT: '#ba1a1a',
          foreground: '#ffffff',
        },
        border: '#e1e3e4',
        input: '#edeeef',
        ring: '#0058be',
        'surface-dim': '#d9dadb',
        'surface-container': '#edeeef',
        'surface-container-low': '#f3f4f5',
        'surface-container-high': '#e7e8e9',
        'surface-container-highest': '#e1e3e4',
        'surface-container-lowest': '#ffffff',
        'on-surface-variant': '#47464b',
        'outline-variant': '#c8c5cb',
        chart: {
          '1': '#0058be',
          '2': '#000000',
          '3': '#77767b',
          '4': '#adc6ff',
          '5': '#ba1a1a',
        },
      },
      borderRadius: {
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
        full: '9999px',
      },
      spacing: {
        unit: '8px',
        gutter: '32px',
        'margin-desktop': '64px',
        'margin-mobile': '24px',
        'container-max': '1440px',
      },
      fontSize: {
        'display-xl': ['80px', { lineHeight: '1.0', letterSpacing: '-0.025em', fontWeight: '900' }],
        'display-lg': ['64px', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '800' }],
        'headline-lg': ['48px', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '1.65', letterSpacing: '0', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '1.65', letterSpacing: '0', fontWeight: '400' }],
        'label-mono': ['14px', { lineHeight: '1.5', letterSpacing: '0.05em', fontWeight: '500' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '0.8' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-shimmer': 'shimmer 4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
