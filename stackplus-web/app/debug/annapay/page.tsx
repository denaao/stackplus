'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'

type LogItem = {
  id: string
  at: string
  source: 'cob' | 'settle' | 'statements'
  ok: boolean
  statusCode?: number
  payload: any
}

function pretty(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export default function AnnapayDebugPage() {
  const router = useRouter()
  const [chargeId, setChargeId] = useState('')
  const [virtualAccount, setVirtualAccount] = useState('')
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<LogItem[]>([])
  const [error, setError] = useState('')

  const hasChargeId = chargeId.trim().length > 0

  const latestBySource = useMemo(() => {
    return {
      cob: logs.find((item) => item.source === 'cob') || null,
      settle: logs.find((item) => item.source === 'settle') || null,
      statements: logs.find((item) => item.source === 'statements') || null,
    }
  }, [logs])

  function pushLog(item: Omit<LogItem, 'id' | 'at'>) {
    setLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        at: new Date().toLocaleString('pt-BR'),
        ...item,
      },
      ...prev,
    ])
  }

  async function runCobLookup() {
    if (!hasChargeId) {
      setError('Informe o chargeId da cobrança.')
      return
    }

    try {
      const { data } = await api.get(`/banking/annapay/cob/${chargeId.trim()}`, {
        params: virtualAccount.trim() ? { virtualAccount: virtualAccount.trim() } : undefined,
      })
      pushLog({ source: 'cob', ok: true, payload: data })
    } catch (err: any) {
      pushLog({
        source: 'cob',
        ok: false,
        statusCode: err?.response?.status,
        payload: err?.response?.data || err?.message || 'Erro desconhecido',
      })
    }
  }

  async function runSettle() {
    if (!hasChargeId) {
      setError('Informe o chargeId da cobrança.')
      return
    }

    try {
      const { data } = await api.post('/banking/annapay/prepaid/settle', {
        chargeId: chargeId.trim(),
        virtualAccount: virtualAccount.trim() || undefined,
      })
      pushLog({ source: 'settle', ok: true, payload: data })
    } catch (err: any) {
      pushLog({
        source: 'settle',
        ok: false,
        statusCode: err?.response?.status,
        payload: err?.response?.data || err?.message || 'Erro desconhecido',
      })
    }
  }

  async function runStatements() {
    try {
      const now = new Date()
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const { data } = await api.get('/banking/annapay/statements', {
        params: {
          Inicio: start.toISOString(),
          Fim: now.toISOString(),
          ...(virtualAccount.trim() ? { virtualAccount: virtualAccount.trim() } : {}),
        },
      })
      pushLog({ source: 'statements', ok: true, payload: data })
    } catch (err: any) {
      pushLog({
        source: 'statements',
        ok: false,
        statusCode: err?.response?.status,
        payload: err?.response?.data || err?.message || 'Erro desconhecido',
      })
    }
  }

  async function runAll() {
    setError('')
    setLoading(true)
    try {
      await runCobLookup()
      await runSettle()
      await runStatements()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">←</button>
        <div>
          <h1 className="font-bold">Debug Annapay</h1>
          <p className="text-xs text-zinc-400">Veja exatamente o que a Annapay e o backend estão retornando.</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Charge ID</label>
              <input
                value={chargeId}
                onChange={(e) => setChargeId(e.target.value)}
                placeholder="ex: gZXO..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Virtual Account (opcional)</label>
              <input
                value={virtualAccount}
                onChange={(e) => setVirtualAccount(e.target.value)}
                placeholder="uuid da conta virtual"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={runAll}
              disabled={loading}
              className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-zinc-900 disabled:opacity-50"
            >
              {loading ? 'Consultando...' : 'Consultar Tudo'}
            </button>
            <button onClick={runCobLookup} disabled={loading} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm">Somente COB</button>
            <button onClick={runSettle} disabled={loading} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm">Somente Settle</button>
            <button onClick={runStatements} disabled={loading} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm">Somente Extrato</button>
            <button onClick={() => setLogs([])} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm">Limpar</button>
          </div>

          {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['cob', 'settle', 'statements'] as const).map((source) => {
            const item = latestBySource[source]
            return (
              <div key={source} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wide">{source}</p>
                {!item ? (
                  <p className="text-xs text-zinc-500">Sem retorno ainda</p>
                ) : (
                  <>
                    <p className={`text-xs ${item.ok ? 'text-sx-cyan' : 'text-red-400'}`}>
                      {item.ok ? 'OK' : `Erro${item.statusCode ? ` (${item.statusCode})` : ''}`}
                    </p>
                    <p className="text-xs text-zinc-500">{item.at}</p>
                  </>
                )}
              </div>
            )
          })}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold mb-3">Log Completo</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-zinc-500">Sem logs ainda.</p>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
              {logs.map((item) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-300 uppercase">{item.source}</span>
                    <span className={item.ok ? 'text-sx-cyan' : 'text-red-400'}>
                      {item.ok ? 'OK' : `Erro${item.statusCode ? ` (${item.statusCode})` : ''}`}
                    </span>
                  </div>
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all">{pretty(item.payload)}</pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
