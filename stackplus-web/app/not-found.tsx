/**
 * Página 404 customizada (App Router do Next).
 *
 * Next mostra isso automaticamente pra rotas inexistentes ou quando
 * notFound() é chamado em server component. Visual alinhado com o brand.
 */

import Link from 'next/link'

export const metadata = {
  title: 'Página não encontrada | STACK+',
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-sx-bg text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-sx-border bg-sx-card p-8 space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-xs tracking-[0.2em] text-sx-cyan font-bold">STACK+</p>
          <p className="text-6xl font-black text-sx-cyan leading-none">404</p>
          <h1 className="text-xl font-black text-white pt-2">Página não encontrada</h1>
        </div>

        <p className="text-sm text-sx-muted leading-relaxed">
          O endereço que você tentou acessar não existe ou foi movido.
          Pode ter sido um link velho ou typo na URL.
        </p>

        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Link
            href="/dashboard"
            className="rounded-lg bg-sx-cyan hover:bg-sx-cyan-dim text-sx-bg font-bold px-5 py-2.5 text-sm transition-colors"
          >
            Ir pro dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-sx-border2 bg-sx-card2 hover:bg-sx-input text-white font-bold px-5 py-2.5 text-sm transition-colors"
          >
            Voltar pro login
          </Link>
        </div>
      </div>
    </div>
  )
}
