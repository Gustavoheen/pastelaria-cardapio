export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'carioca-dark':   '#1a0000',
        'carioca-mid':    '#3d0000',
        'carioca-red':    '#6b0000',
        'carioca-bright': '#CC0000',
        'carioca-gold':   '#F5C800',
      },
      fontFamily: {
        display: ['Bebas Neue', 'sans-serif'],
        body:    ['Nunito', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
