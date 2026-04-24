/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        buy:     '#22c55e',
        hold:    '#94a3b8',
        sell:    '#ef4444',
        primary: '#00d4aa',
        surface: '#131619',
        surface2:'#181c20',
      },
      fontFamily: {
        display: ['Cabinet Grotesk', 'Inter', 'sans-serif'],
        body:    ['Satoshi', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
