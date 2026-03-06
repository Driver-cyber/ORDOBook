/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f5f3ef',
        surface: '#ffffff',
        surface2: '#f0ede8',
        surface3: '#e8e4de',
        border: '#dedad4',
        'border-subtle': '#e8e4de',
        'text-primary': '#1a1918',
        'text-secondary': '#5a5751',
        'text-muted': '#9a9590',
        accent: '#c8a96e',
        'accent-dim': '#a07a3a',
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
