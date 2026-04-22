'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import HomeGameTabs from '@/components/HomeGameTabs'
import { useAuthStore } from '@/store/useStore'
import { useHomeGameRole } from '@/hooks/useHomeGameRole'
import { getErrorMessage } from '@/lib/errors'
import { useConfirm, useAlert } from '@/components/ConfirmDialog'

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
  paymentsByType: Record<string, number>
  cashByPlayer: Array<{ playerId: string; name: string; amount: number }>
  cardByPlayer: Array<{ playerId: string; name: string; amount: number }>
  pixInByPlayer: Array<{ playerId: string; name: string; amount: number }>
  pixOutByPlayer: Array<{ playerId: string; name: string; amount: number }>
  creditsByPlayer: Array<{ playerId: string; name: string; amount: number }>
  debitsByPlayer: Array<{ playerId: string; name: string; amount: number }>
  openComandas: Array<{ id: string; playerId: string; playerName: string; balance: number; openedAt: string }>
  closedComandasDetail?: Array<{ id: string; playerName: string; balance: number; status: string }>
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  PAYMENT_CASH: 'Dinheiro',
  PAYMENT_CARD: 'Cartão',
  PAYMENT_PIX_SPOT: 'PIX (QR)',
  PAYMENT_PIX_TERM: 'PIX 24h',
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

  const { confirm, dialog: confirmDialog } = useConfirm()
  const { alert, dialog: alertDialog } = useAlert()
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
  const [bankBalance, setBankBalance] = useState<number | null>(null)

  // Papel do usuário no home game — define se tem permissão pra listar/gerenciar.
  const { canManage, loading: roleLoading } = useHomeGameRole(homeGameId)

  useEffect(() => {
    if (!homeGameId) return
    if (roleLoading) return
    // Não-manager (PLAYER ou fora do HG) não pode listar comandas. Bloqueia
    // a chamada aqui pra evitar 403 no backend e ruído no log (QUAL-005).
    if (!canManage) {
      setLoading(false)
      setComandas([])
      return
    }
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
            .sort((a, b) => a.player.name.localeCompare(b.player.name, 'pt-BR', { sensitivity: 'base' }))
        }
        setComandas(data)
      })
      .finally(() => setLoading(false))
  }, [homeGameId, playerIdParam, isHistoryMode, canManage, roleLoading])

  // Saldo bancário do home game.
  useEffect(() => {
    if (!homeGameId) { setBankBalance(null); return }
    api.get(`/comanda/bank?homeGameId=${homeGameId}`)
      .then(r => setBankBalance(Number(r.data?.balance ?? 0)))
      .catch(() => setBankBalance(null))
  }, [homeGameId, comandas.length])

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
    } catch (err) {
      setCashboxError(getErrorMessage(err, 'Erro ao fechar caixa'))
    } finally {
      setClosingCashbox(false)
    }
  }

  // Player comum (ou user fora do HG) não pode abrir a listagem de comandas.
  // Mostra tela de acesso restrito em vez de renderizar UI com lista vazia + 403 silencioso.
  if (homeGameId && !roleLoading && !canManage) {
    return (
      <div className="min-h-screen bg-sx-bg text-white">
        <AppHeader
          title="Comandas"
          onBack={() => router.back()}
          userName={user?.name}
          onLogout={() => { logout(); router.push('/') }}
        />
        <main className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-white mb-2">Área restrita</h2>
          <p className="text-sx-muted mb-8">
            A lista de comandas é visível apenas para o host ou co-host do home game.
            Você está aqui como jogador.
          </p>
          <button
            onClick={() => router.push(`/homegame/${homeGameId}`)}
            className="rounded-lg bg-sx-cyan px-5 py-2.5 text-sm font-semibold text-sx-bg"
          >
            Voltar pro home game
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      {confirmDialog}{alertDialog}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-0 sm:divide-x sm:divide-white/10">
            <div className="text-center sm:pr-3">
              <div className="text-[10px] sm:text-xs text-sx-muted mb-1">Total</div>
              <div className="font-bold text-sm text-white">{allBySearch.length}</div>
            </div>
            <div className="text-center sm:px-3">
              <div className="text-[10px] sm:text-xs text-sx-muted mb-1">Saldo bancário</div>
              <div className={`font-bold text-sm ${bankBalance == null ? 'text-sx-muted' : bankBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {bankBalance == null ? '—' : fmtBalance(bankBalance)}
              </div>
            </div>
            <div className="text-center sm:px-3">
              <div className="text-[10px] sm:text-xs text-sx-muted mb-1">Total a pagar</div>
              <div className="font-bold text-sm text-sx-cyan">{fmtBalance(totalPay)}</div>
            </div>
            <div className="text-center sm:pl-3">
              <div className="text-[10px] sm:text-xs text-sx-muted mb-1">A receber</div>
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

          {homeGameId && !isHistoryMode && canManage && (
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
                <button
                  onClick={async () => {
                    if (!homeGameId) return
                    try {
                      const { data } = await api.post('/comanda/bank/reconcile', { homeGameId })
                      await alert(`Reconciliação OK. Lançamentos criados: ${data.reconciledCount}. Novo saldo: R$ ${Number(data.newBalance).toFixed(2)}`, { title: 'Reconciliação concluída' })
                      // Atualiza o saldo mostrado no card
                      const r = await api.get(`/comanda/bank?homeGameId=${homeGameId}`)
                      setBankBalance(Number(r.data?.balance ?? 0))
                    } catch (err) {
                      // Narrow pra extrair status HTTP quando for erro axios.
                      const status = (err && typeof err === 'object' && 'response' in err)
                        ? (err as { response?: { status?: number } }).response?.status
                        : undefined
                      const msg = getErrorMessage(err, 'Erro ao reconciliar')
                      await alert(`Falha ao reconciliar\nStatus: ${status ?? '?'}\nMensagem: ${msg}`, { title: 'Erro' })
                      console.error('[reconcile]', err)
                    }
                  }}
                  className="w-full rounded-lg border border-sx-border2 bg-sx-input hover:bg-sx-card2 text-sx-muted hover:text-white text-sm py-2"
                  title="Cria lançamentos retroativos pra PIX confirmados antes do saldo bancário existir"
                >
                  🔁 Reconciliar saldo bancário
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

                {/* Pagamentos por espécie */}
                {Object.values(cashboxReport.paymentsByType).some(v => v > 0) && (
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-sx-muted mb-2">Pagamentos por espécie</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(cashboxReport.paymentsByType).map(([type, amount]) => (
                        <div key={type} className="rounded-lg border border-sx-border2 bg-sx-input p-3 flex items-center justify-between">
                          <span className="text-xs text-sx-muted">{PAYMENT_TYPE_LABEL[type] ?? type}</span>
                          <span className="text-white font-bold">{fmtBalance(amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detalhamento por jogador e método de pagamento */}
                {([
                  { key: 'cash', label: '💵 Pagamentos em dinheiro', list: cashboxReport.cashByPlayer, color: 'text-white' },
                  { key: 'card', label: '💳 Pagamentos no cartão',   list: cashboxReport.cardByPlayer, color: 'text-white' },
                  { key: 'pixIn', label: '📱 PIX recebidos',          list: cashboxReport.pixInByPlayer, color: 'text-sx-cyan' },
                  { key: 'pixOut', label: '↗ PIX enviados',           list: cashboxReport.pixOutByPlayer, color: 'text-sx-cyan-dim' },
                ] as const).filter(s => s.list.length > 0).map(section => (
                  <div key={section.key}>
                    <h4 className="text-xs uppercase tracking-widest text-sx-muted mb-2">{section.label}</h4>
                    <div className="rounded-lg border border-sx-border2 overflow-hidden max-h-52 overflow-y-auto">
                      {section.list.map((e, i) => (
                        <div key={e.playerId} className={`${i % 2 === 0 ? 'bg-sx-card' : 'bg-sx-input'} px-3 py-2 flex items-center justify-between text-sm`}>
                          <span className="text-zinc-200 truncate">{e.name}</span>
                          <span className={`font-bold tabular-nums ${section.color}`}>{fmtBalance(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Entradas e saídas por jogador — tabela consolidada */}
                {(cashboxReport.creditsByPlayer.length > 0 || cashboxReport.debitsByPlayer.length > 0) && (
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-sx-muted mb-2">Movimentações por jogador</h4>
                    <div className="rounded-lg border border-sx-border2 overflow-hidden max-h-72 overflow-y-auto">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 text-[10px] uppercase tracking-wider text-sx-muted bg-sx-input/40 border-b border-sx-border2">
                        <span>Nome</span>
                        <span className="text-right">Entradas</span>
                        <span className="text-right">Saídas</span>
                      </div>
                      {(() => {
                        const map = new Map<string, { name: string; credit: number; debit: number }>()
                        for (const e of cashboxReport.creditsByPlayer) {
                          map.set(e.playerId, { name: e.name, credit: e.amount, debit: 0 })
                        }
                        for (const e of cashboxReport.debitsByPlayer) {
                          const cur = map.get(e.playerId) ?? { name: e.name, credit: 0, debit: 0 }
                          cur.debit = e.amount
                          map.set(e.playerId, cur)
                        }
                        const rows = Array.from(map.entries())
                          .map(([playerId, v]) => ({ playerId, ...v }))
                          .sort((a, b) => (b.credit + b.debit) - (a.credit + a.debit))
                        return rows.map((r, i) => (
                          <div key={r.playerId} className={`${i % 2 === 0 ? 'bg-sx-card' : 'bg-sx-input'} grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 text-sm`}>
                            <span className="text-zinc-200 truncate">{r.name}</span>
                            <span className={`text-right font-bold tabular-nums ${r.credit > 0 ? 'text-green-400' : 'text-sx-muted/50'}`}>
                              {r.credit > 0 ? fmtBalance(r.credit) : '—'}
                            </span>
                            <span className={`text-right font-bold tabular-nums ${r.debit > 0 ? 'text-red-400' : 'text-sx-muted/50'}`}>
                              {r.debit > 0 ? fmtBalance(r.debit) : '—'}
                            </span>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                )}

                {/* Comandas em aberto com ações */}
                {cashboxReport.openComandas.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-sx-muted mb-2">Comandas em aberto</h4>
                    <div className="rounded-lg border border-sx-border2 overflow-hidden divide-y divide-sx-border2/40 max-h-72 overflow-y-auto">
                      {cashboxReport.openComandas.map((c) => (
                        <div key={c.id} className="bg-sx-card px-3 py-2.5 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-zinc-100 truncate">{c.playerName}</div>
                            <div className={`text-xs ${c.balance < 0 ? 'text-red-400' : c.balance > 0 ? 'text-green-400' : 'text-sx-muted'}`}>
                              Saldo: {fmtBalance(c.balance)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => router.push(`/comanda/${c.id}`)}
                            className="px-2 py-1 text-[11px] font-bold rounded border border-sx-cyan/40 bg-sx-cyan/10 text-sx-cyan hover:bg-sx-cyan/20"
                          >
                            Ir pra comanda
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await confirm(`Fechar a comanda de ${c.playerName}?`, { title: 'Fechar comanda', confirmLabel: 'Fechar', danger: true })
                              if (!ok) return
                              try {
                                await api.post(`/comanda/${c.id}/close`)
                                // Re-gera relatório pra refletir mudança
                                handleCloseCashbox()
                              } catch (err) {
                                await alert(getErrorMessage(err, 'Falha ao fechar comanda'), { title: 'Erro' })
                              }
                            }}
                            className="px-2 py-1 text-[11px] font-bold rounded border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          >
                            Fechar
                          </button>
                        </div>
                      ))}
                    </div>
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
