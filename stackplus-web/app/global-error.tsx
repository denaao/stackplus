'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global app error:', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <p className="text-xs tracking-[0.2em] text-yellow-400 font-bold">STACKPLUS</p>
          <h1 className="text-2xl font-black">Algo deu errado</h1>
          <p className="text-sm text-zinc-400">
            Ocorreu um erro inesperado na aplicação. Tente recarregar a tela.
          </p>
          {error?.digest ? (
            <p className="text-xs text-zinc-500">Ref: {error.digest}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-zinc-900 hover:bg-yellow-300 transition-colors"
            >
              Tentar novamente
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
