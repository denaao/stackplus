'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

interface BlindLevel { level: number; smallBlind: number; bigBlind: number; ante: number }
interface TournamentPlayer { status: string; rebuysCount: number; hasAddon: boolean; timeChipAwarded: boolean; player?: { name: string } }
interface Tournament {
  id: string; name: string; status: string
  startingChips: number; currentLevel: number
  startedAt: string | null
  levelStartedAt: string | null; isOnBreak: boolean; breakStartedAt: string | null
  isPaused: boolean; pausedAt: string | null
  prizePool: string; minutesPerLevelPreLateReg: number; minutesPerLevelPostLateReg: number | null
  lateRegistrationLevel: number | null; breaks: string | null
  dealPayouts: string | null
  payoutStructure: string | null
  timeChipBonus: number | null
  totalChipsInPlay: number | undefined
  blindLevels: BlindLevel[]; players: TournamentPlayer[]
}

// ─── Tabela de pagamentos padrão ─────────────────────────────────────────────
const STANDARD_PAYOUTS: Record<number, number[]> = {
  1: [100], 2: [65, 35], 3: [50, 30, 20], 4: [40, 30, 20, 10],
  5: [35, 25, 20, 12, 8], 6: [30, 22, 17, 13, 10, 8],
  7: [27, 20, 15, 13, 10, 9, 6], 8: [25, 18, 14, 12, 10, 8, 7, 6],
  9: [24, 17, 13, 11, 9, 8, 7, 6, 5], 10: [22, 16, 12, 10, 9, 8, 7, 6, 5, 5],
}

function getSuggestedPayouts(n: number): number[] {
  if (STANDARD_PAYOUTS[n]) return STANDARD_PAYOUTS[n]
  const base = Math.floor(100 / n)
  const arr = Array(n).fill(base)
  let remainder = 100 - base * n
  for (let i = 0; i < remainder; i++) arr[i]++
  return arr
}

// Calcula os prêmios a exibir
// Prioridade: 1) dealPayouts (acordo ativo) 2) payoutStructure (estrutura salva) 3) padrão por nº de jogadores
function calcDisplayPayouts(
  prizePool: number,
  totalPlayers: number,
  dealPayouts: string | null,
  payoutStructure: string | null,
): { pos: string; amount: number; color: string }[] {
  const posColors = ['#FBBF24', '#9CA3AF', '#B45309', '#60A5FA', '#A78BFA']
  const posLabel = (n: number) => `${n}º`

  // 1. Acordo ativo — mostra valores negociados
  if (dealPayouts) {
    try {
      const parsed: { position: number; amount: number }[] = JSON.parse(dealPayouts)
      return parsed
        .sort((a, b) => a.position - b.position)
        .map((p, i) => ({
          pos: posLabel(p.position),
          amount: p.amount,
          color: posColors[i] ?? '#6B7280',
        }))
    } catch { /* fallback */ }
  }

  // 2. Estrutura de payout salva no modal
  if (payoutStructure) {
    try {
      const parsed: { position: number; percent: number }[] = JSON.parse(payoutStructure)
      return parsed
        .sort((a, b) => a.position - b.position)
        .map((p, i) => ({
          pos: posLabel(p.position),
          amount: Math.round(prizePool * p.percent / 100 * 100) / 100,
          color: posColors[i] ?? '#6B7280',
        }))
    } catch { /* fallback */ }
  }

  // 3. Padrão calculado pelo número de jogadores (fallback)
  const n = Math.min(totalPlayers > 0 ? totalPlayers : 1, 5)
  const pcts = getSuggestedPayouts(n)
  return pcts.map((pct, i) => ({
    pos: posLabel(i + 1),
    amount: Math.round(prizePool * pct / 100 * 100) / 100,
    color: posColors[i] ?? '#6B7280',
  }))
}

function parseBreaks(raw: string | null): { afterLevel: number; durationMinutes: number }[] {
  try { return JSON.parse(raw ?? '[]') } catch { return [] }
}

function fmt(n: number) { return n.toLocaleString('pt-BR') }
function pad(n: number) { return String(n).padStart(2, '0') }
function timerStr(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// Calcula elapsed a partir de um timestamp ISO — mesma lógica do TimerCard
// referenceMs: quando pausado, usa o momento da pausa em vez de Date.now()
function elapsedFrom(startStr: string | null, referenceMs: number): number {
  if (!startStr) return 0
  const val = Math.floor((referenceMs - new Date(startStr).getTime()) / 1000)
  return val < 0 ? 0 : val
}

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id) }, [])
  return now
}

interface ClockPosition {
  level: number
  remaining: number
  overTime: boolean
  isPaused: boolean
  isOnBreak: boolean
  breakDurationMins: number
  currentBlind: BlindLevel | undefined
  nextBlind: BlindLevel | undefined
  nextBreakIn: number | null
}

// Usa levelStartedAt / breakStartedAt direto — mesma fonte de verdade que o TimerCard
function calcPosition(t: Tournament, breaks: { afterLevel: number; durationMinutes: number }[], now: number): ClockPosition {
  const sortedLevels = [...t.blindLevels].sort((a, b) => a.level - b.level)
  const currentBlind = sortedLevels.find(l => l.level === t.currentLevel)
  const currentIndex = sortedLevels.findIndex(l => l.level === t.currentLevel)
  const nextBlind = currentIndex >= 0 ? sortedLevels[currentIndex + 1] : undefined

  // Quando pausado, congela o elapsed no momento da pausa
  const effectiveNow = (t.isPaused && t.pausedAt) ? new Date(t.pausedAt).getTime() : now

  if (t.isOnBreak) {
    const activeBreak = breaks.find(b => b.afterLevel === t.currentLevel)
    const breakDurationMins = activeBreak?.durationMinutes || 15
    const elapsed = elapsedFrom(t.breakStartedAt, effectiveNow)
    const totalSecs = breakDurationMins * 60
    return {
      level: t.currentLevel, remaining: Math.max(0, totalSecs - elapsed), overTime: elapsed > totalSecs,
      isPaused: t.isPaused, isOnBreak: true, breakDurationMins, currentBlind, nextBlind, nextBreakIn: null,
    }
  }

  const levelMins = (t.lateRegistrationLevel != null && t.currentLevel > t.lateRegistrationLevel && t.minutesPerLevelPostLateReg)
    ? t.minutesPerLevelPostLateReg
    : (t.minutesPerLevelPreLateReg || 15)
  const totalSecs = levelMins * 60
  const elapsed = elapsedFrom(t.levelStartedAt, effectiveNow)

  // Próximo intervalo: break mais próximo após o nível atual (sort garante o mais imediato)
  const nextBreakEntry = [...breaks].sort((a, b) => a.afterLevel - b.afterLevel).find(b => b.afterLevel >= t.currentLevel)
  let nextBreakIn: number | null = null
  if (nextBreakEntry) {
    const levelsAway = nextBreakEntry.afterLevel - t.currentLevel
    const remaining = Math.max(0, totalSecs - elapsed)
    nextBreakIn = remaining + levelsAway * totalSecs
  }

  return {
    level: t.currentLevel,
    remaining: Math.max(0, totalSecs - elapsed),
    overTime: elapsed > totalSecs,
    isPaused: t.isPaused,
    isOnBreak: false,
    breakDurationMins: 0,
    currentBlind,
    nextBlind,
    nextBreakIn,
  }
}

// ─── Design tokens (matching sx-* palette) ───────────────────────────────────
const C = {
  bg:       '#050D15',
  card:     '#071828',
  card2:    '#0C2438',
  border:   'rgba(0,200,224,0.12)',
  borderHi: 'rgba(0,200,224,0.3)',
  cyan:     '#00C8E0',
  cyanDim:  'rgba(0,200,224,0.25)',
  cyanFaint:'rgba(0,200,224,0.06)',
  muted:    '#4A7A90',
  text:     '#ffffff',
  // break palette
  breakBg:  '#0D0A00',
  breakBg2: '#1A1200',
  breakBorder: 'rgba(234,179,8,0.25)',
  breakBorderHi: 'rgba(234,179,8,0.5)',
  breakAccent: '#EAB308',
  breakDim: 'rgba(234,179,8,0.15)',
  green:    '#00C8E0',
}

export default function TournamentClockPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const [t, setT] = useState<Tournament | null>(null)
  const now = useNow()

  useEffect(() => {
    const load = () => fetch(`${API}/tournament-clock/${tournamentId}`).then(r => r.json()).then(setT).catch(() => {})
    load(); const id = setInterval(load, 5000); return () => clearInterval(id)
  }, [tournamentId])

  if (!t) return (
    <div style={{ background: C.bg, width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: `4px solid ${C.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (t.status === 'FINISHED') {
    const winner = t.players.find(p => p.status === 'WINNER')
    return (
      <div style={{
        width: '100vw', height: '100vh', background: `linear-gradient(160deg, #050D15 0%, #071020 100%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif', gap: 32,
      }}>
        <div style={{ color: 'rgba(0,200,224,0.3)', fontSize: 13, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          Stack+
        </div>
        <div style={{ fontSize: 'clamp(3rem, 10vw, 7rem)', fontWeight: 900, color: '#FBBF24', letterSpacing: '0.05em', textAlign: 'center', lineHeight: 1.1 }}>
          🏆
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'clamp(0.8rem, 2vw, 1.1rem)', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 12 }}>
            Torneio Encerrado
          </div>
          <div style={{ color: '#ffffff', fontSize: 'clamp(2rem, 6vw, 4rem)', fontWeight: 900, letterSpacing: '0.05em' }}>
            {t.name}
          </div>
          {winner && (
            <div style={{ marginTop: 24, color: '#FBBF24', fontSize: 'clamp(1.2rem, 3.5vw, 2.5rem)', fontWeight: 800 }}>
              {winner.player?.name ?? '—'}
            </div>
          )}
          {winner && (
            <div style={{ color: 'rgba(251,191,36,0.5)', fontSize: 'clamp(0.8rem, 1.5vw, 1rem)', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 8 }}>
              Campeão
            </div>
          )}
        </div>
        <div style={{ color: 'rgba(0,200,224,0.25)', fontSize: 13, letterSpacing: '0.1em', marginTop: 16 }}>
          Prize pool · R$ {parseFloat(t.prizePool).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
      </div>
    )
  }

  const breaks = parseBreaks(t.breaks)
  const pos = calcPosition(t, breaks, now)
  const { level, remaining, overTime, isPaused, isOnBreak, breakDurationMins, currentBlind, nextBlind, nextBreakIn } = pos
  const levelMins = (t.lateRegistrationLevel != null && level > t.lateRegistrationLevel && t.minutesPerLevelPostLateReg)
    ? t.minutesPerLevelPostLateReg
    : (t.minutesPerLevelPreLateReg || 15)

  const active  = t.players.filter(p => ['REGISTERED', 'ACTIVE', 'WINNER'].includes(p.status)).length
  const total   = t.players.length
  const rebuys  = t.players.reduce((s, p) => s + p.rebuysCount, 0)
  const addons  = t.players.filter(p => p.hasAddon).length
  const totalChips = t.totalChipsInPlay ?? 0
  const avgStack   = active > 0 ? Math.floor(totalChips / active) : 0
  const prize      = parseFloat(t.prizePool)

  // Theme switches for break vs running
  const accent      = isOnBreak ? C.breakAccent    : C.cyan
  const accentDim   = isOnBreak ? C.breakDim       : C.cyanDim
  const accentFaint = isOnBreak ? 'rgba(234,179,8,0.04)' : C.cyanFaint
  const borderColor = isOnBreak ? C.breakBorder    : C.border
  const borderHi    = isOnBreak ? C.breakBorderHi  : C.borderHi
  const pageBg      = isOnBreak
    ? `linear-gradient(160deg, ${C.breakBg} 0%, ${C.breakBg2} 100%)`
    : `linear-gradient(160deg, ${C.bg} 0%, #071828 100%)`

  const dividerStyle = {
    height: 1, margin: '0 32px',
    background: `linear-gradient(90deg, transparent, ${accentDim}, transparent)`,
    flexShrink: 0,
  }

  const cardStyle = (extra?: object) => ({
    background: isOnBreak
      ? `linear-gradient(135deg, #110d00 0%, #1a1400 100%)`
      : `linear-gradient(135deg, ${C.card} 0%, ${C.card2} 100%)`,
    border: `1px solid ${borderColor}`,
    borderRadius: 14,
    ...extra,
  })

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      background: pageBg, fontFamily: 'system-ui, -apple-system, sans-serif', userSelect: 'none',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px 12px', flexShrink: 0 }}>
        {/* STACK+ — esquerda, grande e branco */}
        <div style={{ color: '#00C8E0', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', textShadow: '0 0 20px rgba(0,200,224,0.75)', lineHeight: 1 }}>
          STACK+
        </div>
        <h1 style={{ color: C.text, fontSize: 'clamp(1.2rem, 3vw, 2rem)', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
          {t.name}
        </h1>
        {/* Logo SX — direita */}
        <Image
          src="/sx-poker-logo.png"
          alt="SX Poker"
          width={112}
          height={56}
          style={{ height: 'clamp(36px, 4vw, 56px)', width: 'auto', objectFit: 'contain' }}
        />
      </div>

      <div style={dividerStyle} />

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0, padding: '10px 20px 10px' }}>

        {/* Left: timer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

          {/* Timer card */}
          <div style={{
            ...cardStyle({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }),
            boxShadow: `0 0 120px ${accentFaint} inset, 0 0 40px ${accentFaint}`,
          }}>
            {/* Glow orb */}
            <div style={{
              position: 'absolute', width: '60%', height: '60%', borderRadius: '50%',
              background: `radial-gradient(circle, ${accentFaint} 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />

            {isOnBreak && (
              <div style={{
                position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(234,179,8,0.1)', border: `1px solid ${C.breakBorder}`,
                borderRadius: 20, padding: '5px 18px',
                color: C.breakAccent, fontSize: 11, fontWeight: 700,
                letterSpacing: '0.25em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>
                ☕ &nbsp;Intervalo — {breakDurationMins} minutos
              </div>
            )}

            {isPaused && (
              <>
                <style>{`
                  @keyframes pauseBlink {
                    0%, 49% { opacity: 1; }
                    50%, 100% { opacity: 0; }
                  }
                  .pause-badge { animation: pauseBlink 1s step-start infinite; }
                `}</style>
                <div className="pause-badge" style={{
                  position: 'absolute', top: isOnBreak ? 60 : 0, bottom: isOnBreak ? 'auto' : 0,
                  left: 0, right: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none', zIndex: 10,
                }}>
                  <div style={{
                    background: 'rgba(239,68,68,0.15)',
                    border: '3px solid #ef4444',
                    borderRadius: 16,
                    padding: 'clamp(10px, 2vh, 20px) clamp(32px, 6vw, 80px)',
                    color: '#ef4444',
                    fontSize: 'clamp(2rem, 5vw, 4rem)',
                    fontWeight: 900,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    textShadow: '0 0 40px rgba(239,68,68,0.6)',
                    boxShadow: '0 0 60px rgba(239,68,68,0.2) inset',
                  }}>
                    ⏸ PAUSADO
                  </div>
                </div>
              </>
            )}

            <div style={{
              fontSize: 'clamp(5.5rem, 20vw, 14rem)',
              fontWeight: 900,
              color: overTime && !isOnBreak ? '#f87171' : isPaused ? 'rgba(255,255,255,0.35)' : accent,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              textShadow: isPaused ? 'none' : `0 0 80px ${accentDim}, 0 0 160px ${accentFaint}`,
              position: 'relative',
            }}>
              {overTime && !isOnBreak ? '+' : ''}{timerStr(remaining)}
            </div>
          </div>

          {/* Nível / Blinds / Ante */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10, flexShrink: 0 }}>
            {[
              { label: 'Nível', value: String(level), mono: true },
              {
                label: 'Blinds',
                value: isOnBreak ? 'PAUSA' : currentBlind ? `${fmt(currentBlind.smallBlind)} / ${fmt(currentBlind.bigBlind)}` : '—',
                accent: isOnBreak,
                mono: true,
              },
              {
                label: 'Ante',
                value: currentBlind && currentBlind.ante > 0 ? fmt(currentBlind.ante) : '—',
                mono: true,
              },
            ].map(({ label, value, accent: useAccent, mono }) => (
              <div key={label} style={{
                ...cardStyle({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 8px' }),
              }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 'clamp(1.8rem, 4.5vw, 3.5rem)',
                  fontWeight: 900, color: useAccent ? C.breakAccent : C.text,
                  fontVariantNumeric: mono ? 'tabular-nums' : undefined,
                  lineHeight: 1,
                }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Próximo nível + Próximo intervalo */}
          {(() => {
            const nextIsBreak = !isOnBreak && breaks.some(b => b.afterLevel === level)
            const nextLevelValue = nextBlind
              ? `${fmt(nextBlind.smallBlind)} / ${fmt(nextBlind.bigBlind)}${nextBlind.ante > 0 ? ` / ${fmt(nextBlind.ante)}` : ''}`
              : 'Último nível'
            const proximoValue = nextIsBreak ? 'INTERVALO' : nextLevelValue
            const proximoHi = nextIsBreak
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
                <div style={cardStyle({ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px' })}>
                  <span style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    Próximo nível
                  </span>
                  <span style={{
                    fontSize: 'clamp(1rem, 2vw, 1.5rem)',
                    fontWeight: 700,
                    color: proximoHi ? C.breakAccent : accent,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: proximoHi ? '0.1em' : undefined,
                  }}>
                    {proximoValue}
                  </span>
                </div>
                <div style={cardStyle({ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px' })}>
                  <span style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {isOnBreak ? 'Intervalo restante' : 'Próximo intervalo'}
                  </span>
                  <span style={{
                    fontSize: 'clamp(1rem, 2vw, 1.5rem)',
                    fontWeight: 700,
                    color: isOnBreak ? C.breakAccent : accent,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {isOnBreak ? timerStr(remaining) : nextBreakIn !== null ? timerStr(nextBreakIn) : '—'}
                  </span>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Right sidebar */}
        <div style={{ width: 200, marginLeft: 12, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>

          {/* Status */}
          <div style={cardStyle({ padding: '14px 16px' })}>
            <div style={{ color: accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
              Status
            </div>
            {([['Jogadores', `${active} / ${total}`], ['Rebuys', rebuys], ['Add-ons', addons]] as [string, string|number][]).map(([k, v], i, arr) => (
              <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${borderColor}` : 'none' }}>
                <span style={{ color: C.muted, fontSize: 13 }}>{k}</span>
                <span style={{ color: C.text, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Estatísticas */}
          <div style={cardStyle({ padding: '14px 16px' })}>
            <div style={{ color: accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
              Estatísticas
            </div>
            {([['Stack médio', fmt(avgStack)], ['Total fichas', fmt(totalChips)]] as [string, string][]).map(([k, v], i) => (
              <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i === 0 ? `1px solid ${borderColor}` : 'none' }}>
                <span style={{ color: C.muted, fontSize: 13 }}>{k}</span>
                <span style={{ color: C.text, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
              <span style={{ color: C.muted, fontSize: 13 }}>Prêmio</span>
              <span style={{ color: C.green, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                R$ {prize.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Premiação */}
          {prize > 0 && (() => {
            const displayPayouts = calcDisplayPayouts(prize, total, t.dealPayouts, t.payoutStructure)
            return (
              <div style={cardStyle({ padding: '14px 16px', flex: 1 })}>
                <div style={{ color: accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
                  {t.dealPayouts ? '🤝 Acordo' : t.payoutStructure ? 'Premiação' : 'Premiação'}
                </div>
                {displayPayouts.map(({ pos, amount, color }, i, arr) => (
                  <div key={pos} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${borderColor}` : 'none' }}>
                    <span style={{ color, fontSize: 14, fontWeight: 800 }}>{pos}</span>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Footer */}
      <div style={dividerStyle} />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, padding: '8px 0 10px', flexShrink: 0 }}>
        {[
          `Nível ${level}`,
          `${levelMins} min/nível`,
          t.lateRegistrationLevel ? `Late reg. até nível ${t.lateRegistrationLevel}` : null,
        ].filter(Boolean).map(s => (
          <span key={s!} style={{ color: accentDim, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em' }}>{s}</span>
        ))}
      </div>
    </div>
  )
}
