/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:                  'var(--color-bg)',
        surface:             'var(--color-surface)',
        'surface-2':         'var(--color-surface-2)',
        'surface-offset':    'var(--color-surface-offset)',
        border:              'var(--color-border)',
        divider:             'var(--color-divider)',
        primary:             'var(--color-primary)',
        'primary-highlight': 'var(--color-primary-highlight)',
        text:                'var(--color-text)',
        'text-muted':        'var(--color-text-muted)',
        'text-faint':        'var(--color-text-faint)',
        buy:                 'var(--color-buy)',
        hold:                'var(--color-hold)',
        sell:                'var(--color-sell)',
        navy:                'var(--color-navy)',
      },
      fontFamily: {
        display: ['Boska', 'Georgia', 'serif'],
        body:    ['General Sans', 'Helvetica Neue', 'sans-serif'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
}
