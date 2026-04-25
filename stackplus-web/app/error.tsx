'use client'

/**
 * Error boundary de primeiro nivel (App Router do Next).
 *
 * Dispara quando um componente React crasha em runtime dentro de qualquer
 * rota. Captura renderiza fallback sem perder a shell do site, e oferece
 * retry local (reset) ou reload completo.
 *
 * Se o layout root crashar, Next cai pro global-error.tsx. Esse error.tsx
 * cobre o caso comum (crash dentro de uma page).
 */

import { useEffect } from 'react'
import Link from 'next/link'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log no console pra dev; em prod ideal é integrar Sentry aqui.
    // Quando adicionarmos @sentry/nextjs: Sentry.captureException(error)
    console.error('[route error]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-sx-bg text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-sx-border bg-sx-card p-6 space-y-5">
        <div className="space-y-1">
          <p className="text-xs tracking-[0.2em] text-sx-cyan font-bold">STACK+</p>
          <h1 className="text-2xl font-black text-white">Algo deu errado</h1>
        </div>

        <p className="text-sm text-sx-muted leading-relaxed">
          Encontramos um erro inesperado nessa tela. Pode ser um problema
          temporário — tenta novamente. Se persistir, recarregue a página.
        </p>

        {error?.digest && (
          <div className="rounded-lg border border-sx-border2 bg-sx-input px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-sx-muted">Código do erro</p>
            <p className="font-mono text-xs text-sx-cyan break-all">{error.digest}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={reset}
            className="rounded-lg bg-sx-cyan hover:bg-sx-cyan-dim text-sx-bg font-bold px-5 py-2.5 text-sm transition-colors"
          >
            Tentar novamente
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-sx-border2 bg-sx-card2 hover:bg-sx-input text-white font-bold px-5 py-2.5 text-sm transition-colors"
          >
            Recarregar página
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-sx-border2 text-sx-muted hover:text-white hover:border-sx-border font-bold px-5 py-2.5 text-sm transition-colors"
          >
            Ir pro dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
