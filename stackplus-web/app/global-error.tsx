'use client'

/**
 * Error boundary catastrofico — acionado APENAS se o layout root do Next
 * crashar. Na maioria dos crashes, app/error.tsx captura primeiro. Esse
 * aqui é o ultimo recurso: precisa renderizar seu proprio <html>/<body>
 * porque o layout root morreu.
 *
 * Mantem visual brandado mas sem depender de tokens Tailwind (caso o CSS
 * bundle tambem tenha falhado) — inline styles pra garantir que algo
 * aparece mesmo no pior cenario.
 */

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global error]', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          minHeight: '100vh',
          background: '#050D15',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '480px',
            background: '#071828',
            border: '1px solid #132A40',
            borderRadius: '16px',
            padding: '28px',
          }}
        >
          <p style={{ fontSize: '11px', letterSpacing: '0.2em', color: '#00C8E0', fontWeight: 700, margin: 0 }}>
            STACK+
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 900, marginTop: '8px', marginBottom: '14px' }}>
            Algo deu errado
          </h1>
          <p style={{ fontSize: '14px', color: '#4A7A90', lineHeight: 1.5, marginBottom: '18px' }}>
            Encontramos um erro critico na aplicacao. Tenta recarregar a pagina.
            Se o problema persistir, abra em uma aba anonima ou limpe o cache.
          </p>
          {error?.digest && (
            <div
              style={{
                background: '#0A1F30',
                border: '1px solid #1A3550',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '18px',
              }}
            >
              <p style={{ fontSize: '10px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                Codigo do erro
              </p>
              <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#00C8E0', margin: '4px 0 0', wordBreak: 'break-all' }}>
                {error.digest}
              </p>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                background: '#00C8E0',
                color: '#050D15',
                fontWeight: 700,
                fontSize: '14px',
                padding: '10px 20px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#0C2238',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '14px',
                padding: '10px 20px',
                border: '1px solid #1A3550',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Recarregar página
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
