'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import { useAuthStore } from '@/store/useStore'

interface PlayerState {
  userId: string
  chipsIn: string
  chipsOut: string
  result: string
  hasCashedOut: boolean
  user: { id: string; name: string }
}

interface Transaction {
  id: string
  userId: string
  type: 'BUYIN' | 'REBUY' | 'ADDON' | 'CASHOUT' | 'JACKPOT'
  amount: string | number
  chips: string | number
  registeredBy?: string | null
}

interface StaffAssignment {
  userId: string
  caixinha?: string | null
  user: { id: string; name: string }
}

interface RakebackAssignment {
  userId: string
  percent?: number
  user: { id: string; name: string }
}

interface Session {
  id: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  pokerVariant: string | null
  chipValue: string | null
  rake: string | null
  caixinha: string | null
  caixinhaMode: string | null
  jackpotEnabled: boolean
  smallBlind: string | null
  bigBlind: string | null
  minimumBuyIn: string | null
  playerStates: PlayerState[]
  staffAssignments: StaffAssignment[]
  rakebackAssignments: RakebackAssignment[]
  homeGame: { id: string; name: string; chipValue: string }
}

const VARIANT_LABELS: Record<string, string> = {
  HOLDEN: 'Hold\'em',
  BUTTON_CHOICE: 'Button Choice',
  PINEAPPLE: 'Pineapple',
  OMAHA: 'Omaha',
  OMAHA_HI_LO: 'Omaha Hi-Lo',
  SHORT_DECK: 'Short Deck',
  MIXED: 'Mixed',
}

function fmt(v: string | number | null | undefined) {
  if (v == null) return 'R$ 0,00'
  return `R$ ${Math.abs(Number(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function fmtSigned(v: string | number | null | undefined) {
  const n = Number(v ?? 0)
  const abs = `R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  return n >= 0 ? `+${abs}` : `-${abs}`
}

function duration(start: string | null, end: string | null) {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}min` : `${m} min`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs text-white/40 uppercase tracking-widest font-medium mb-3">{title}</h3>
      {children}
    </div>
  )
}

function MetricCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col gap-1" style={{
      background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
      border: '1px solid rgba(0,200,224,0.12)',
    }}>
      <div className="text-xs text-sx-muted">{label}</div>
      <div className={`text-base font-bold tabular-nums ${color ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-[11px] text-sx-muted">{sub}</div>}
    </div>
  )
}

export default function SessionReportPage() {
  const { id: sessionId } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [session, setSession] = useState<Session | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get(`/sessions/${sessionId}`),
      api.get('/cashier/transactions', { params: { sessionId } }),
    ]).then(([sessionRes, txRes]) => {
      setSession(sessionRes.data)
      setTransactions(txRes.data || [])
    }).finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return <AppLoading />

  if (!session) return (
    <div className="min-h-screen bg-sx-bg flex items-center justify-center text-white/40 text-sm">
      Sessão não encontrada
    </div>
  )

  // ── Cálculos a partir das transações ────────────────────────────────────────

  const buyinTxs    = transactions.filter(t => t.type === 'BUYIN')
  const rebuyTxs    = transactions.filter(t => t.type === 'REBUY')
  const addonTxs    = transactions.filter(t => t.type === 'ADDON')
  const cashoutTxs  = transactions.filter(t => t.type === 'CASHOUT')
  const jackpotTxs  = transactions.filter(t => t.type === 'JACKPOT')

  const totalBuyins  = buyinTxs.reduce((s, t) => s + Number(t.amount), 0)
  const totalRebuys  = rebuyTxs.reduce((s, t) => s + Number(t.amount), 0)
  const totalAddons  = addonTxs.reduce((s, t) => s + Number(t.amount), 0)
  const totalCashouts = cashoutTxs.reduce((s, t) => s + Number(t.amount), 0)
  const totalJackpot = jackpotTxs.reduce((s, t) => s + Number(t.amount), 0)
  const totalGross   = totalBuyins + totalRebuys + totalAddons

  const rake        = Number(session.rake ?? 0)
  const caixinha    = Number(session.caixinha ?? 0)

  // Caixinha por staff (modo INDIVIDUAL usa staffAssignment.caixinha)
  const caixinhaMode = session.caixinhaMode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'SPLIT'
  const staffCount = session.staffAssignments.length

  const caixinhaByStaff = session.staffAssignments.map(a => ({
    name: a.user.name,
    amount: caixinhaMode === 'INDIVIDUAL'
      ? Number(a.caixinha ?? 0)
      : staffCount > 0 ? caixinha / staffCount : 0,
  })).filter(a => a.amount > 0)

  const rakebackTotal = session.rakebackAssignments.reduce((s, a) => {
    const percent = Number(a.percent ?? 0)
    return s + (rake * percent / 100)
  }, 0)

  // Resultado por jogador (da playerState — fonte de verdade do backend)
  const players = [...(session.playerStates ?? [])].sort((a, b) => {
    // Ordem: maior resultado primeiro
    return Number(b.result) - Number(a.result)
  })

  // Jogadores com saldo positivo vs negativo
  const winners = players.filter(p => Number(p.result) > 0)
  const losers  = players.filter(p => Number(p.result) < 0)
  const even    = players.filter(p => Number(p.result) === 0)

  const chipValue = Number(session.chipValue ?? session.homeGame.chipValue ?? 1)
  const variant = VARIANT_LABELS[session.pokerVariant ?? 'HOLDEN'] ?? session.pokerVariant ?? 'Hold\'em'

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      <AppHeader
        title="Relatório"
        onBack={() => router.back()}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Cabeçalho da sessão */}
        <div className="rounded-xl px-5 py-4" style={{
          background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
          border: '1px solid rgba(0,200,224,0.2)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
        }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{session.homeGame.name}</h2>
              <div className="text-xs text-sx-muted mt-1 space-y-0.5">
                <div>{variant}{session.smallBlind && session.bigBlind ? ` · Blinds ${fmt(session.smallBlind)}/${fmt(session.bigBlind)}` : ''}</div>
                {session.startedAt && (
                  <div>Iniciada em {new Date(session.startedAt).toLocaleString('pt-BR')}</div>
                )}
                {session.finishedAt && (
                  <div>Finalizada em {new Date(session.finishedAt).toLocaleString('pt-BR')}</div>
                )}
                <div>Duração: {duration(session.startedAt, session.finishedAt)}</div>
                <div>Valor da ficha: {fmt(chipValue)}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-sx-muted mb-1">Jogadores</div>
              <div className="text-2xl font-black text-white">{players.length}</div>
            </div>
          </div>
        </div>

        {/* Arrecadação */}
        <Section title="Arrecadação">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricCard label={`Buy-ins (${buyinTxs.length}×)`} value={fmt(totalBuyins)} />
            {rebuyTxs.length > 0 && <MetricCard label={`Rebuys (${rebuyTxs.length}×)`} value={fmt(totalRebuys)} />}
            {addonTxs.length > 0 && <MetricCard label={`Add-ons (${addonTxs.length}×)`} value={fmt(totalAddons)} />}
            {totalGross > 0 && <MetricCard label="Total em fichas" value={fmt(totalGross)} color="text-sx-cyan" />}
            {totalCashouts > 0 && <MetricCard label={`Cashouts (${cashoutTxs.length}×)`} value={fmt(totalCashouts)} color="text-sx-cyan" />}
            {jackpotTxs.length > 0 && <MetricCard label={`Jackpot pago (${jackpotTxs.length}×)`} value={fmt(totalJackpot)} color="text-sx-cyan" />}
          </div>
        </Section>

        {/* Casa */}
        <Section title="Casa">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rake > 0 && <MetricCard label="Rake" value={fmt(rake)} color="text-yellow-400" />}
            {caixinha > 0 && <MetricCard label="Caixinha" value={fmt(caixinha)} color="text-amber-300" sub={staffCount > 0 ? `${staffCount} staff` : undefined} />}
            {rakebackTotal > 0 && <MetricCard label="Rakeback pago" value={fmt(rakebackTotal)} color="text-orange-300" />}
          </div>

          {/* Staff / caixinha por pessoa */}
          {caixinhaByStaff.length > 0 && (
            <div className="mt-3 rounded-xl overflow-hidden border border-white/5">
              <div className="bg-white/[0.02] px-4 py-2 text-[10px] uppercase tracking-widest text-white/30">Caixinha por staff</div>
              {caixinhaByStaff.map((s, i) => (
                <div key={i} className={`${i % 2 === 0 ? 'bg-sx-card' : 'bg-white/[0.03]'} px-4 py-2.5 flex justify-between text-xs`}>
                  <span className="text-white/60">{s.name}</span>
                  <span className="text-amber-300 font-semibold">{fmt(s.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Rakeback por staff */}
          {session.rakebackAssignments.length > 0 && rake > 0 && (
            <div className="mt-3 rounded-xl overflow-hidden border border-white/5">
              <div className="bg-white/[0.02] px-4 py-2 text-[10px] uppercase tracking-widest text-white/30">Rakeback por staff</div>
              {session.rakebackAssignments.map((a, i) => {
                const percent = Number(a.percent ?? 0)
                const amount = rake * percent / 100
                return (
                  <div key={a.userId} className={`${i % 2 === 0 ? 'bg-sx-card' : 'bg-white/[0.03]'} px-4 py-2.5 flex justify-between text-xs`}>
                    <span className="text-white/60">{a.user.name} <span className="text-white/30">({percent.toFixed(1)}%)</span></span>
                    <span className="text-orange-300 font-semibold">{fmt(amount)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* Resultado por jogador */}
        <Section title="Resultado dos jogadores">
          <div className="rounded-xl overflow-hidden border border-white/5">
            {players.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-white/30">Nenhum jogador registrado</div>
            )}
            {players.map((p, i) => {
              const result = Number(p.result)
              const isProfit = result > 0
              const isLoss = result < 0
              const resultColor = isProfit ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-white/40'
              const rowBg = isProfit
                ? i % 2 === 0 ? 'bg-green-900/10' : 'bg-green-900/5'
                : isLoss
                  ? i % 2 === 0 ? 'bg-red-900/10' : 'bg-red-900/5'
                  : i % 2 === 0 ? 'bg-sx-card' : 'bg-white/[0.03]'

              return (
                <div key={p.userId} className={`${rowBg} px-4 py-3`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {isProfit ? '▲ ' : isLoss ? '▼ ' : '— '}{p.user.name}
                      </div>
                      <div className="text-xs text-white/30 mt-0.5">
                        Investido {fmt(p.chipsIn)}
                        {p.hasCashedOut ? ` · Cashout ${fmt(p.chipsOut)}` : ' · Sem cashout'}
                      </div>
                    </div>
                    <div className={`text-sm font-bold tabular-nums shrink-0 ${resultColor}`}>
                      {fmtSigned(result)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Resumo: vencedores vs perdedores */}
          {(winners.length > 0 || losers.length > 0) && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl px-4 py-3" style={{
                background: 'rgba(0,200,224,0.06)',
                border: '1px solid rgba(0,200,224,0.15)',
              }}>
                <div className="text-[11px] text-sx-cyan/70 mb-1">{winners.length} lucraram</div>
                <div className="text-base font-bold text-sx-cyan tabular-nums">
                  {fmt(winners.reduce((s, p) => s + Number(p.result), 0))}
                </div>
              </div>
              <div className="rounded-xl px-4 py-3" style={{
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.15)',
              }}>
                <div className="text-[11px] text-red-400/70 mb-1">{losers.length} perderam</div>
                <div className="text-base font-bold text-red-400 tabular-nums">
                  {fmt(Math.abs(losers.reduce((s, p) => s + Number(p.result), 0)))}
                </div>
              </div>
            </div>
          )}
        </Section>

      </main>
    </div>
  )
}
