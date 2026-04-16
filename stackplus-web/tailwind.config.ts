import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sx: {
          bg:      '#050D15',
          card:    '#071828',
          card2:   '#0C2238',
          input:   '#0A1F30',
          border:  '#132A40',
          border2: '#1A3550',
          cyan:    '#00C8E0',
          'cyan-dim': '#009CB0',
          muted:   '#4A7A90',
        },
      },
    },
  },
  plugins: [],
}
export default config
