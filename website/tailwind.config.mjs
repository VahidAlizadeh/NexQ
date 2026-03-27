/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0c0c14',
          raised: '#12121c',
          overlay: '#1a1a28',
        },
        accent: {
          purple: '#a78bfa',
          blue: '#60a5fa',
          green: '#34d399',
          red: '#ef4444',
          amber: '#fbbf24',
        },
        text: {
          primary: '#f0f0f5',
          secondary: '#8888a0',
          muted: '#555566',
        },
        border: {
          DEFAULT: '#1e1e2e',
          subtle: '#16161f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
