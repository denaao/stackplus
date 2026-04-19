'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import HomeGameTabs from '@/components/HomeGameTabs'
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

interface CashboxReport {
  generatedAt: string
  periodStart: string | null
  periodEnd: string | null
  totals: {
    totalDebits: number
    totalCredits: number
    totalCash: number
    totalPixIn: number
    totalPixOut: number
    totalRake: number
    totalCaixinha: number
    totalRakeback: number
    totalPendingPix: number
  }
  comandasClosed: number
  comandasStillOpen: number
  openBalancesTotal: number
  playersWithDebt: number
  playersWithCredit: number
  sessionsCount: number
  tournamentsCount: number
  closedComandasDetail?: Array<{ id: string; playerName: string; balance: number; status: string }>
}

export default function ComandasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sx-bg" />}>
      <ComandasContent />
    </Suspense>
  )
}

function ComandasContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const homeGameId = searchParams.get('homeGameId') ?? ''
  const playerIdParam = searchParams.get('playerId') ?? ''
  const statusParam = searchParams.get('status') ?? ''
  const isHistoryMode = !!playerIdParam
  const { user, logout } = useAuthStore()

  const [comandas, setComandas] = useState<Comanda[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    isHistoryMode ? 'CLOSED' : 'OPEN'
  )
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCloseCashboxModal, setShowCloseCashboxModal] = useState(false)
  const [closingCashbox, setClosingCashbox] = useState(false)
  const [cashboxReport, setCashboxReport] = useState<CashboxReport | null>(null)
  const [cashboxError, setCashboxError] = useState<string | null>(null)

  useEffect(() => {
    if (!homeGameId) return
    setLoading(true)
    const params = new URLSearchParams({ homeGameId })
    // No modo histórico filtra por status no backend; no normal busca tudo e filtra no frontend
    if (isHistoryMode) params.set('status', 'CLOSED')
    api.get(`/comanda?${params}`)
      .then(r => {
        let data: Comanda[] = r.data
        if (playerIdParam) {
          data = data.filter(c => c.player.id === playerIdParam)
        } else {
          // Mantém apenas a comanda mais recente por jogador
          const latest = new Map<string, Comanda>()
          for (const c of data) {
            const existing = latest.get(c.player.id)
            if (!existing || new Date(c.openedAt) > new Date(existing.openedAt)) {
              latest.set(c.player.id, c)
            }
          }
          data = Array.from(latest.values())
            .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
        }
        setComandas(data)
      })
      .finally(() => setLoading(false))
  }, [homeGameId, playerIdParam, isHistoryMode])

  const allBySearch = comandas.filter(c =>
    c.player.name.toLowerCase().includes(search.toLowerCase())
  )

  const filtered = allBySearch.filter(c => {
    // Filtro de status aplicável em qualquer modo
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    const b = parseFloat(c.balance)
    if (balanceFilter === 'CREDIT') return b > 0
    if (balanceFilter === 'DEBT') return b < 0
    return true
  })

  const totalPay = allBySearch.filter(c => parseFloat(c.balance) > 0).reduce((s, c) => s + parseFloat(c.balance), 0)
  const totalDebt = allBySearch.filter(c => parseFloat(c.balance) < 0).reduce((s, c) => s + parseFloat(c.balance), 0)
  const countCredit = allBySearch.filter(c => parseFloat(c.balance) > 0).length
  const countDebt = allBySearch.filter(c => parseFloat(c.balance) < 0).length

  function toggleBalance(f: BalanceFilter) {
    setBalanceFilter(prev => prev === f ? 'ALL' : f)
  }

  async function handleCloseCashbox() {
    if (!homeGameId) return
    setClosingCashbox(true)
    setCashboxError(null)
    try {
      const { data } = await api.post('/comanda/cashbox/close', { homeGameId })
      setCashboxReport(data)
    } catch (err: any) {
      setCashboxError(err?.response?.data?.error ?? err?.message ?? 'Erro ao fechar caixa')
    } finally {
      setClosingCashbox(false)
    }
  }

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      <AppHeader
        title="Comandas"
        onBack={() => router.back()}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />
      {homeGameId && <HomeGameTabs homeGameId={homeGameId} active="COMANDAS" />}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Banner modo histórico */}
        {isHistoryMode && (
          <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{
            background: 'rgba(0,200,224,0.08)',
            border: '1px solid rgba(0,200,224,0.25)',
          }}>
            <div className="text-xs text-sx-cyan font-medium">
              📋 Histórico de comandas anteriores
            </div>
            <button
              onClick={() => router.back()}
              className="text-xs text-sx-muted hover:text-white"
            >
              ← Voltar
            </button>
          </div>
        )}

        {/* Resumo */}
        <div className="rounded-xl px-4 py-4" style={{
          background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
          border: '1px solid rgba(0,200,224,0.15)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
        }}>
          <div className="grid grid-cols-3 divide-x divide-white/10">
            <div className="text-center pr-4">
              <div className="text-xs text-sx-muted mb-1">Total</div>
              <div className="font-bold text-sm text-white">{allBySearch.length}</div>
            </div>
            <div className="text-center px-4">
              <div className="text-xs text-sx-muted mb-1">Total a pagar</div>
              <div className="font-bold text-sm text-sx-cyan">{fmtBalance(totalPay)}</div>
            </div>
            <div className="text-center pl-4">
              <div className="text-xs text-sx-muted mb-1">A receber</div>
              <div className="font-bold text-sm text-red-400">{fmtBalance(Math.abs(totalDebt))}</div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => toggleBalance('CREDIT')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={balanceFilter === 'CREDIT'
              ? { background: 'rgba(0,200,224,0.15)', border: '1px solid rgba(0,200,224,0.4)', color: '#00C8E0' }
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

          <button
            onClick={() => setStatusFilter(statusFilter === 'OPEN' ? 'ALL' : 'OPEN')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={statusFilter === 'OPEN'
              ? { background: 'rgba(0,200,224,0.15)', border: '1px solid rgba(0,200,224,0.4)', color: '#00C8E0' }
              : { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }
            }
          >
            Abertas
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === 'CLOSED' ? 'ALL' : 'CLOSED')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={statusFilter === 'CLOSED'
              ? { background: 'rgba(74,122,144,0.2)', border: '1px solid rgba(74,122,144,0.4)', color: '#a8c5d1' }
              : { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }
            }
          >
            Fechadas
          </button>

          {homeGameId && !isHistoryMode && (
            <button
              onClick={() => setShowCloseCashboxModal(true)}
              className="ml-auto px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#fbbf24' }}
              title="Gera relatório com todas as entradas e saídas e fecha as comandas abertas"
            >
              🔒 Fechar caixa
            </button>
          )}
        </div>

        {/* Busca */}
        <input
          className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-cyan"
          placeholder="Buscar por jogador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Header da lista */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs text-white/40 uppercase tracking-widest font-medium">Jogadores</h3>
          <span className="text-xs text-sx-muted">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-sx-cyan border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-white/30 py-12 text-sm rounded-xl" style={{
            background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
            border: '1px solid rgba(0,200,224,0.12)',
          }}>
            Nenhuma comanda encontrada
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const balance = parseFloat(c.balance)
              const balanceColor = balance > 0 ? '#00C8E0' : balance < 0 ? '#f87171' : '#4A7A90'
              const barColor = balance > 0 ? '#00C8E0' : balance < 0 ? '#ef4444' : 'rgba(255,255,255,0.15)'
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/comanda/${c.id}`)}
                  className="relative w-full rounded-xl overflow-hidden cursor-pointer text-left transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
                    border: '1px solid rgba(0,200,224,0.12)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(0,200,224,0.3)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(0,200,224,0.12)' }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: barColor }} />
                  <div className="pl-4 pr-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm text-white">{c.player.name}</div>
                      <div className="text-xs text-sx-muted mt-0.5">
                        {c.mode === 'PREPAID' ? 'Pré-pago' : 'Pós-pago'} ·{' '}
                        {c.status === 'OPEN'
                          ? <span className="text-sx-cyan">Aberta</span>
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

      {/* Modal: confirmar + relatório de Fechar caixa */}
      {showCloseCashboxModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => { if (!closingCashbox) { setShowCloseCashboxModal(false); setCashboxReport(null); setCashboxError(null) } }}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-sx-card border border-sx-border2 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {cashboxReport ? 'Relatório de caixa' : 'Fechar caixa'}
              </h3>
              <button
                onClick={() => { setShowCloseCashboxModal(false); setCashboxReport(null); setCashboxError(null) }}
                disabled={closingCashbox}
                className="text-white/40 hover:text-white disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {!cashboxReport && !cashboxError && (
              <>
                <p className="text-sm text-sx-muted">
                  Vai gerar um relatório consolidado com todas as entradas e saídas financeiras de sessões, torneios e comandas deste home game.
                </p>
                <button
                  onClick={handleCloseCashbox}
                  disabled={closingCashbox}
                  className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 text-sx-bg font-bold py-2.5 disabled:opacity-50"
                >
                  {closingCashbox ? 'Gerando...' : '🔒 Gerar relatório'}
                </button>
              </>
            )}

            {cashboxError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {cashboxError}
              </div>
            )}

            {cashboxReport && (
              <div className="space-y-4">
                <p className="text-xs text-sx-muted">
                  Gerado em {new Date(cashboxReport.generatedAt).toLocaleString('pt-BR')}
                </p>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Entradas (créditos)</div>
                    <div className="text-green-400 font-bold">{fmtBalance(cashboxReport.totals.totalCredits)}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Saídas (débitos)</div>
                    <div className="text-red-400 font-bold">{fmtBalance(cashboxReport.totals.totalDebits)}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Dinheiro</div>
                    <div className="text-white font-bold">{fmtBalance(cashboxReport.totals.totalCash)}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">PIX recebido</div>
                    <div className="text-sx-cyan font-bold">{fmtBalance(cashboxReport.totals.totalPixIn)}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">PIX enviado</div>
                    <div className="text-sx-cyan-dim font-bold">{fmtBalance(cashboxReport.totals.totalPixOut)}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">PIX pendente</div>
                    <div className="text-yellow-400 font-bold">{fmtBalance(cashboxReport.totals.totalPendingPix)}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Rake</div>
                    <div className="text-white font-bold">{fmtBalance(cashboxReport.totals.totalRake)}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Caixinha</div>
                    <div className="text-white font-bold">{fmtBalance(cashboxReport.totals.totalCaixinha)}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3 col-span-2">
                    <div className="text-xs text-sx-muted">Rakeback distribuído</div>
                    <div className="text-white font-bold">{fmtBalance(cashboxReport.totals.totalRakeback)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Sessões (cash)</div>
                    <div className="text-white font-bold">{cashboxReport.sessionsCount}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Torneios</div>
                    <div className="text-white font-bold">{cashboxReport.tournamentsCount}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Comandas fechadas</div>
                    <div className="text-white font-bold">{cashboxReport.comandasClosed}</div>
                  </div>
                  <div className="rounded-lg border border-sx-border2 bg-sx-input p-3">
                    <div className="text-xs text-sx-muted">Comandas em aberto</div>
                    <div className="text-white font-bold">{cashboxReport.comandasStillOpen}</div>
                  </div>
                </div>

                {cashboxReport.comandasStillOpen > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    ⚠ Ainda há {cashboxReport.comandasStillOpen} comandas em aberto. Saldo consolidado das comandas abertas: {fmtBalance(cashboxReport.openBalancesTotal)} ({cashboxReport.playersWithCredit} credor · {cashboxReport.playersWithDebt} devedor).
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
