/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0e0f11',
        surface: '#16181c',
        surface2: '#1e2025',
        surface3: '#242730',
        border: '#2a2d35',
        'border-subtle': '#1e2025',
        'text-primary': '#f0f0ee',
        'text-secondary': '#8a8f9e',
        'text-muted': '#4a4f5e',
        accent: '#c8a96e',
        'accent-dim': '#7a6540',
        grade: {
          green: '#4caf85',
          yellow: '#d4a44c',
          red: '#c05a5a',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
        display: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
