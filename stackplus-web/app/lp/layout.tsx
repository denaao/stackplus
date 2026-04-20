import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.stackplus.com.br'),
  title: 'StackPlus — O jeito fácil de organizar seu home game de poker',
  description:
    'Organize seu home game como um profissional. Controle fichas, torneios e premiação em tempo real — sem planilha, sem confusão. Grátis durante o beta.',
  openGraph: {
    title: 'StackPlus — Home game de poker sem planilha, sem confusão',
    description:
      'Crie sua mesa, convide sua galera e jogue com tudo no controle. TV ao vivo, caixa automatizada e torneio estruturado.',
    type: 'website',
    locale: 'pt_BR',
    images: ['/stackplus-icon-blue.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StackPlus — Home game de poker',
    description: 'Crie sua mesa, convide sua galera e jogue com tudo no controle.',
    images: ['/stackplus-icon-blue.svg'],
  },
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-sx-bg text-zinc-100">{children}</div>
}
