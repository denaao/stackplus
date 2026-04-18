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
          bg:       '#050D15',
          card:     '#071828',
          card2:    '#0C2238',
          input:    '#0A1F30',
          border:   '#132A40',
          border2:  '#1A3550',
          cyan:     '#00C8E0',
          'cyan-dim':  '#009CB0',
          'cyan-deep': '#005A73',
          teal:     '#0A3A50',
          muted:    '#4A7A90',
        },
      },
      boxShadow: {
        'sx-glow':    '0 0 24px rgba(0,200,224,0.35)',
        'sx-glow-sm': '0 0 12px rgba(0,200,224,0.2)',
        'sx-glow-lg': '0 4px 40px rgba(0,200,224,0.55)',
        'sx-glow-btn':'0 4px 22px rgba(0,200,224,0.45)',
      },
    },
  },
  plugins: [],
}
export default config
