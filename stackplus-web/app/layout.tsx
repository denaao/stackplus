import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'STACKPLUS — Home Game Manager',
  description: 'Gerencie seus Home Games de Poker em tempo real',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-zinc-100`}>
        {children}
      </body>
    </html>
  )
}
