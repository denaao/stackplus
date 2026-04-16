'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'

interface Comanda {
  id: string
  status: 'OPEN' | 'CLOSED'
  mode: 'PREPAID' | 'POSTPAID'
  balance: string
  openedAt: string
  closedAt: string | null
  player: { id: string; name: string }
}

const modeLabel = { PREPAID: 'Pré-pago', POSTPAID: 'Pós-pago' }

export default function ComandasPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const homeGameId = searchParams.get('homeGameId') ?? ''

  const [comandas, setComandas] = useState<Comanda[]>([])
  const [filter, setFilter] = useState<'OPEN' | 'CLOSED' | 'ALL'>('OPEN')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!homeGameId) return
    setLoading(true)
    const params = new URLSearchParams({ homeGameId })
    if (filter !== 'ALL') params.set('status', filter)
    api.get(`/comanda?${params}`).then(r => setComandas(r.data)).finally(() => setLoading(false))
  }, [homeGameId, filter])

  const filtered = comandas.filter(c =>
    c.player.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalBalance = filtered.reduce((s, c) => s + parseFloat(c.balance), 0)
  const totalDebt = filtered.filter(c => parseFloat(c.balance) < 0).reduce((s, c) => s + parseFloat(c.balance), 0)

  function fmtBalance(n: string | number) {
    const v = parseFloat(String(n))
    const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    return v < 0 ? `- R$ ${abs}` : `R$ ${abs}`
  }

  const input = 'w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-cyan'

  return (
    <div className="min-h-screen bg-sx-bg text-white p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sx-muted hover:text-white">←</button>
        <h1 className="text-xl font-bold flex-1">Comandas</h1>
      </div>

      {/* Resumo */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-sx-card rounded-xl p-3 text-center">
            <div className="text-xs text-white/40 mb-1">Total</div>
            <div className="font-bold text-sm">{filtered.length}</div>
          </div>
          <div className="bg-sx-card rounded-xl p-3 text-center">
            <div className="text-xs text-white/40 mb-1">Saldo total</div>
            <div className={`font-bold text-sm ${totalBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtBalance(totalBalance)}
            </div>
          </div>
          <div className="bg-sx-card rounded-xl p-3 text-center">
            <div className="text-xs text-white/40 mb-1">A receber</div>
            <div className="font-bold text-sm text-red-400">{fmtBalance(Math.abs(totalDebt))}</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-3">
        {(['OPEN', 'CLOSED', 'ALL'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-sx-input text-sx-muted hover:text-white'}`}
          >
            {f === 'OPEN' ? 'Abertas' : f === 'CLOSED' ? 'Fechadas' : 'Todas'}
          </button>
        ))}
        <div className="flex-1" />
      </div>

      <input
        className={`${input} mb-4`}
        placeholder="Buscar por jogador..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-white/30 py-12 text-sm">Nenhuma comanda encontrada</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const balance = parseFloat(c.balance)
            const balanceColor = balance > 0 ? 'text-green-400' : balance < 0 ? 'text-red-400' : 'text-sx-muted'
            return (
              <button
                key={c.id}
                onClick={() => router.push(`/comanda/${c.id}`)}
                className="w-full bg-sx-card hover:bg-sx-input rounded-xl p-4 flex items-center justify-between transition-colors"
              >
                <div className="text-left">
                  <div className="font-semibold text-sm">{c.player.name}</div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {modeLabel[c.mode]} · {c.status === 'OPEN' ? (
                      <span className="text-green-500">Aberta</span>
                    ) : (
                      <span className="text-white/40">Fechada</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold text-sm tabular-nums ${balanceColor}`}>{fmtBalance(c.balance)}</div>
                  <div className="text-xs text-white/30 mt-0.5">
                    {new Date(c.openedAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
