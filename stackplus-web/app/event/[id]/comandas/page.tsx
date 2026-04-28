'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import EventTabs from '@/components/EventTabs'
import { useAuthStore } from '@/store/useStore'

interface Comanda {
  id: string
  status: 'OPEN' | 'CLOSED'
  mode: 'PREPAID' | 'POSTPAID'
  balance: string
  openedAt: string
  closedAt: string | null
  player: { id: string; name: string }
}

function fmtBalance(n: string | number) {
  const v = parseFloat(String(n))
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  return v < 0 ? `- R$ ${abs}` : `R$ ${abs}`
}

type StatusFilter = 'OPEN' | 'CLOSED' | 'ALL'
type BalanceFilter = 'ALL' | 'CREDIT' | 'DEBT'

export default function EventComandasPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, logout } = useAuthStore()

  const [comandas, setComandas] = useState<Comanda[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN')
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ eventId })
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    api.get(`/comanda?${params}`)
      .then(r => setComandas(r.data))
      .catch(e => setError(e?.response?.data?.error ?? 'Erro ao carregar comandas'))
      .finally(() => setLoading(false))
  }, [eventId, statusFilter])

  const filtered = comandas
    .filter(c => c.player.name.toLowerCase().includes(search.toLowerCase()))
    .filter(c => {
      const b = parseFloat(c.balance)
      if (balanceFilter === 'CREDIT') return b > 0
      if (balanceFilter === 'DEBT') return b < 0
      return true
    })

  const allBySearch = comandas.filter(c =>
    c.player.name.toLowerCase().includes(search.toLowerCase())
  )
  const totalPay = allBySearch.filter(c => parseFloat(c.balance) > 0).reduce((s, c) => s + parseFloat(c.balance), 0)
  const totalDebt = allBySearch.filter(c => parseFloat(c.balance) < 0).reduce((s, c) => s + parseFloat(c.balance), 0)
  const countCredit = allBySearch.filter(c => parseFloat(c.balance) > 0).length
  const countDebt = allBySearch.filter(c => parseFloat(c.balance) < 0).length

  function toggleBalance(f: BalanceFilter) {
    setBalanceFilter(prev => prev === f ? 'ALL' : f)
  }

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      <AppHeader
        title="Comandas"
        onBack={() => router.push(`/event/${eventId}`)}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />
      <EventTabs eventId={eventId} active="COMANDAS" canManage={true} />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Resumo */}
        <div className="rounded-xl px-4 py-4" style={{
          background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 60%, #050300 100%)',
          border: '1px solid rgba(245,158,11,0.15)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
        }}>
          <div className="grid grid-cols-3 divide-x divide-white/10">
            <div className="text-center pr-4">
              <div className="text-xs text-sx-muted mb-1">Total</div>
              <div className="font-bold text-sm text-white">{allBySearch.length}</div>
            </div>
            <div className="text-center px-4">
              <div className="text-xs text-sx-muted mb-1">Total a pagar</div>
              <div className="font-bold text-sm text-sx-amber">{fmtBalance(totalPay)}</div>
            </div>
            <div className="text-center pl-4">
              <div className="text-xs text-sx-muted mb-1">A receber</div>
              <div className="font-bold text-sm text-red-400">{fmtBalance(Math.abs(totalDebt))}</div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          {(['OPEN', 'CLOSED', 'ALL'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={statusFilter === f
                ? { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#F59E0B' }
                : { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }
              }
            >
              {f === 'OPEN' ? 'Abertas' : f === 'CLOSED' ? 'Fechadas' : 'Todas'}
            </button>
          ))}

          <button
            onClick={() => toggleBalance('CREDIT')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={balanceFilter === 'CREDIT'
              ? { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#F59E0B' }
              : { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }
            }
          >
            Com crédito ({countCredit})
          </button>

          <button
            onClick={() => toggleBalance('DEBT')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={balanceFilter === 'DEBT'
              ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }
              : { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }
            }
          >
            Em débito ({countDebt})
          </button>
        </div>

        {/* Busca */}
        <input
          className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-amber"
          placeholder="Buscar por jogador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="flex items-center justify-between">
          <h3 className="text-xs text-white/40 uppercase tracking-widest font-medium">Jogadores</h3>
          <span className="text-xs text-sx-muted">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-sx-amber border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center text-red-400 py-12 text-sm rounded-xl" style={{
            background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 60%, #050300 100%)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-white/30 py-12 text-sm rounded-xl" style={{
            background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 60%, #050300 100%)',
            border: '1px solid rgba(245,158,11,0.12)',
          }}>
            Nenhuma comanda encontrada
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const balance = parseFloat(c.balance)
              const balanceColor = balance > 0 ? '#F59E0B' : balance < 0 ? '#f87171' : '#4A7A90'
              const barColor = balance > 0 ? '#F59E0B' : balance < 0 ? '#ef4444' : 'rgba(255,255,255,0.15)'
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/comanda/${c.id}`)}
                  className="relative w-full rounded-xl overflow-hidden cursor-pointer text-left transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 60%, #050300 100%)',
                    border: '1px solid rgba(245,158,11,0.12)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(245,158,11,0.3)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(245,158,11,0.12)' }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: barColor }} />
                  <div className="pl-4 pr-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm text-white">{c.player.name}</div>
                      <div className="text-xs text-sx-muted mt-0.5">
                        {c.mode === 'PREPAID' ? 'Pré-pago' : 'Pós-pago'} ·{' '}
                        {c.status === 'OPEN'
                          ? <span className="text-sx-amber">Aberta</span>
                          : <span className="text-white/40">Fechada</span>
                        }
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm tabular-nums" style={{ color: balanceColor }}>
                        {fmtBalance(c.balance)}
                      </div>
                      <div className="text-xs text-white/30 mt-0.5">
                        {new Date(c.openedAt).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

      </main>
    </div>
  )
}
