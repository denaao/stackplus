'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import { useAuthStore } from '@/store/useStore'

interface Player {
  id: string
  status: string
  position: number | null
  rebuysCount: number
  hasAddon: boolean
  bountyCollected: string
  prizeAmount: string | null
  player: { id: string; name: string }
  eliminatedBy: { player: { name: string } } | null
}

interface Tournament {
  id: string
  name: string
  status: string
  buyInAmount: string
  rebuyAmount: string | null
  addonAmount: string | null
  bountyAmount: string | null
  rake: string
  buyInTaxAmount: string | null
  rebuyTaxAmount: string | null
  addonTaxAmount: string | null
  prizePool: string
  totalRake: string
  totalTax: string
  payoutStructure: string | null
  dealPayouts: string | null
  startedAt: string | null
  finishedAt: string | null
  players: Player[]
}

function fmt(v: string | number | null | undefined) {
  if (v == null) return 'R$ 0,00'
  return `R$ ${Math.abs(Number(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function duration(start: string | null, end: string | null) {
  if (!start || !end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}min` : `${m} min`
}

function posLabel(pos: number | null) {
  if (pos == null) return '—'
  if (pos === 1) return '🥇 1º'
  if (pos === 2) return '🥈 2º'
  if (pos === 3) return '🥉 3º'
  return `${pos}º`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs text-white/40 uppercase tracking-widest font-medium mb-3">{title}</h3>
      {children}
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-4 py-3 flex flex-col gap-1" style={{
      background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
      border: '1px solid rgba(0,200,224,0.12)',
    }}>
      <div className="text-xs text-sx-muted">{label}</div>
      <div className={`text-base font-bold tabular-nums ${color ?? 'text-white'}`}>{value}</div>
    </div>
  )
}

export default function TournamentReportPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [t, setT] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/tournaments/${tournamentId}`)
      .then(r => setT(r.data))
      .finally(() => setLoading(false))
  }, [tournamentId])

  if (loading) return <AppLoading />

  if (!t) return (
    <div className="min-h-screen bg-sx-bg flex items-center justify-center text-white/40 text-sm">
      Torneio não encontrado
    </div>
  )

  // ── Cálculos ────────────────────────────────────────────────────────────────
  const buyIn = Number(t.buyInAmount)
  const rebuy = Number(t.rebuyAmount ?? 0)
  const addon = Number(t.addonAmount ?? 0)
  const buyInTax = Number(t.buyInTaxAmount ?? 0)
  const rebuyTax = Number(t.rebuyTaxAmount ?? 0)
  const addonTax = Number(t.addonTaxAmount ?? 0)

  const totalPlayers = t.players.length
  const totalRebuys = t.players.reduce((s, p) => s + p.rebuysCount, 0)
  const totalAddons = t.players.filter(p => p.hasAddon).length
  const totalBounty = t.players.reduce((s, p) => s + Number(p.bountyCollected), 0)

  const grossBuyIns = buyIn * totalPlayers
  const grossRebuys = rebuy * totalRebuys
  const grossAddons = addon * totalAddons
  const grossTaxBuyIn = buyInTax * totalPlayers
  const grossTaxRebuy = rebuyTax * totalRebuys
  const grossTaxAddon = addonTax * totalAddons
  const totalTaxCalc = Number(t.totalTax) || (grossTaxBuyIn + grossTaxRebuy + grossTaxAddon)
  const totalRakeCalc = Number(t.totalRake)
  const prizePool = Number(t.prizePool)
  const totalGross = grossBuyIns + grossRebuys + grossAddons

  // Payout para exibir prêmio de cada jogador
  function getExpectedPrize(pos: number | null): number | null {
    if (pos == null) return null
    if (t!.dealPayouts) {
      try {
        const d: { position: number; amount: number }[] = JSON.parse(t!.dealPayouts)
        const e = d.find(x => x.position === pos)
        if (e) return e.amount
      } catch {}
    }
    if (t!.payoutStructure) {
      try {
        const s: { position: number; percent: number }[] = JSON.parse(t!.payoutStructure)
        const e = s.find(x => x.position === pos)
        if (e) return Math.round(prizePool * e.percent / 100 * 100) / 100
      } catch {}
    }
    return Number(t!.players.find(p => p.position === pos)?.prizeAmount ?? null) || null
  }

  // Ordena: WINNER primeiro, depois ELIMINATED por posição asc, depois resto
  const sorted = [...t.players].sort((a, b) => {
    if (a.status === 'WINNER') return -1
    if (b.status === 'WINNER') return 1
    if (a.status === 'ELIMINATED' && b.status === 'ELIMINATED') {
      return (a.position ?? 99) - (b.position ?? 99)
    }
    return 0
  })

  const paidPositions = sorted.filter(p => {
    const prize = getExpectedPrize(p.position)
    return prize != null && prize > 0
  })

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      <AppHeader
        title="Relatório"
        onBack={() => router.push(`/tournament/${tournamentId}`)}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Cabeçalho do torneio */}
        <div className="rounded-xl px-5 py-4" style={{
          background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
          border: '1px solid rgba(0,200,224,0.2)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
        }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{t.name}</h2>
              <div className="text-xs text-sx-muted mt-1 space-y-0.5">
                {t.startedAt && (
                  <div>Iniciado em {new Date(t.startedAt).toLocaleString('pt-BR')}</div>
                )}
                {t.finishedAt && (
                  <div>Finalizado em {new Date(t.finishedAt).toLocaleString('pt-BR')}</div>
                )}
                <div>Duração: {duration(t.startedAt, t.finishedAt)}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-sx-muted mb-1">Jogadores</div>
              <div className="text-2xl font-black text-white">{totalPlayers}</div>
            </div>
          </div>
        </div>

        {/* Arrecadação */}
        <Section title="Arrecadação">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricCard label={`Buy-ins (${totalPlayers}×)`} value={fmt(grossBuyIns)} />
            {totalRebuys > 0 && <MetricCard label={`Rebuys (${totalRebuys}×)`} value={fmt(grossRebuys)} />}
            {totalAddons > 0 && <MetricCard label={`Add-ons (${totalAddons}×)`} value={fmt(grossAddons)} />}
            {totalGross > 0 && <MetricCard label="Total bruto" value={fmt(totalGross)} color="text-sx-cyan" />}
          </div>
        </Section>

        {/* Taxas e Rake */}
        <Section title="Taxas e Rake">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricCard label="Prize Pool" value={fmt(prizePool)} color="text-sx-cyan" />
            {totalRakeCalc > 0 && <MetricCard label="Rake total" value={fmt(totalRakeCalc)} color="text-yellow-400" />}
            {totalTaxCalc > 0 && <MetricCard label="Taxas totais" value={fmt(totalTaxCalc)} color="text-orange-400" />}
            {totalBounty > 0 && <MetricCard label="Bounties pagos" value={fmt(totalBounty)} />}
          </div>
          {(buyIn > 0 || rebuy > 0 || addon > 0) && (
            <div className="mt-3 rounded-xl overflow-hidden border border-white/5">
              {buyIn > 0 && (
                <div className="bg-sx-card px-4 py-2.5 flex justify-between text-xs">
                  <span className="text-white/50">Buy-in base</span>
                  <span className="text-white">{fmt(buyIn)} /jogador</span>
                </div>
              )}
              {buyInTax > 0 && (
                <div className="bg-white/[0.03] px-4 py-2.5 flex justify-between text-xs">
                  <span className="text-white/50">Taxa buy-in</span>
                  <span className="text-orange-300">{fmt(buyInTax)} /jogador</span>
                </div>
              )}
              {rebuy > 0 && (
                <div className="bg-sx-card px-4 py-2.5 flex justify-between text-xs">
                  <span className="text-white/50">Rebuy base</span>
                  <span className="text-white">{fmt(rebuy)} /rebuy</span>
                </div>
              )}
              {rebuyTax > 0 && (
                <div className="bg-white/[0.03] px-4 py-2.5 flex justify-between text-xs">
                  <span className="text-white/50">Taxa rebuy</span>
                  <span className="text-orange-300">{fmt(rebuyTax)} /rebuy</span>
                </div>
              )}
              {addon > 0 && (
                <div className="bg-sx-card px-4 py-2.5 flex justify-between text-xs">
                  <span className="text-white/50">Add-on base</span>
                  <span className="text-white">{fmt(addon)} /add-on</span>
                </div>
              )}
              {addonTax > 0 && (
                <div className="bg-white/[0.03] px-4 py-2.5 flex justify-between text-xs">
                  <span className="text-white/50">Taxa add-on</span>
                  <span className="text-orange-300">{fmt(addonTax)} /add-on</span>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Premiação */}
        {paidPositions.length > 0 && (
          <Section title="Premiação">
            <div className="rounded-xl overflow-hidden border border-white/5">
              {paidPositions.map((p, i) => {
                const prize = getExpectedPrize(p.position)
                const isDeal = !!t.dealPayouts
                return (
                  <div key={p.id} className={`${i % 2 === 0 ? 'bg-sx-card' : 'bg-white/[0.03]'} px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold w-10">{posLabel(p.position)}</span>
                      <div>
                        <div className="text-sm font-semibold text-white">{p.player.name}</div>
                        {isDeal && <div className="text-[10px] text-sx-cyan mt-0.5">Acordo</div>}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-green-400 tabular-nums">{fmt(prize)}</div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Classificação geral */}
        <Section title="Classificação geral">
          <div className="rounded-xl overflow-hidden border border-white/5">
            {sorted.map((p, i) => {
              const isWinner = p.status === 'WINNER'
              const rowBg = isWinner
                ? 'bg-yellow-900/20'
                : i % 2 === 0 ? 'bg-sx-card' : 'bg-white/[0.03]'
              return (
                <div key={p.id} className={`${rowBg} px-4 py-3`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-white/50 w-8 shrink-0">
                        {posLabel(p.position)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {isWinner && '🏆 '}{p.player.name}
                        </div>
                        {p.eliminatedBy && (
                          <div className="text-xs text-white/30 mt-0.5">
                            Eliminado por {p.eliminatedBy.player.name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div className="text-xs text-sx-muted space-x-2">
                        {p.rebuysCount > 0 && <span>{p.rebuysCount} rebuy{p.rebuysCount > 1 ? 's' : ''}</span>}
                        {p.hasAddon && <span>add-on</span>}
                        {Number(p.bountyCollected) > 0 && <span className="text-yellow-400">bounty {fmt(p.bountyCollected)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

      </main>
    </div>
  )
}
