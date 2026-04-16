'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

interface BlindLevel { level: number; smallBlind: number; bigBlind: number; ante: number }
interface TournamentPlayer { status: string; rebuysCount: number; hasAddon: boolean }
interface Tournament {
  id: string; name: string; status: string
  startingChips: number; currentLevel: number
  startedAt: string | null
  levelStartedAt: string | null; isOnBreak: boolean; breakStartedAt: string | null
  prizePool: string; minutesPerLevelPreLateReg: number; minutesPerLevelPostLateReg: number | null
  lateRegistrationLevel: number | null; breaks: string | null
  blindLevels: BlindLevel[]; players: TournamentPlayer[]
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

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id) }, [])
  return now
}

interface ClockPosition {
  level: number
  remaining: number        // seconds left in current slot
  isOnBreak: boolean
  breakDurationMins: number
  currentBlind: BlindLevel | undefined
  nextBlind: BlindLevel | undefined
  nextBreakIn: number | null  // seconds until next break
}

function calcPosition(
  startedAt: string | null,
  levels: BlindLevel[],
  breaks: { afterLevel: number; durationMinutes: number }[],
  levelMins: number,
  now: number
): ClockPosition {
  const noData: ClockPosition = {
    level: 0, remaining: 0, isOnBreak: false, breakDurationMins: 0,
    currentBlind: undefined, nextBlind: undefined, nextBreakIn: null,
  }
  if (!startedAt || levels.length === 0) return noData

  let elapsed = Math.floor((now - new Date(startedAt).getTime()) / 1000)
  if (elapsed < 0) elapsed = 0

  const breakMap = new Map(breaks.map(b => [b.afterLevel, b.durationMinutes]))

  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i]
    const levelSecs = levelMins * 60

    if (elapsed < levelSecs) {
      // We're inside this level
      const nextBreakEntry = breaks.find(b => b.afterLevel >= lvl.level)
      let nextBreakIn: number | null = null
      if (nextBreakEntry) {
        const levelsAway = nextBreakEntry.afterLevel - lvl.level
        nextBreakIn = (levelSecs - elapsed) + levelsAway * levelSecs
      }
      return {
        level: lvl.level,
        remaining: levelSecs - elapsed,
        isOnBreak: false,
        breakDurationMins: 0,
        currentBlind: lvl,
        nextBlind: levels[i + 1],
        nextBreakIn,
      }
    }
    elapsed -= levelSecs

    // Check break after this level
    const breakDur = breakMap.get(lvl.level)
    if (breakDur !== undefined) {
      const breakSecs = breakDur * 60
      if (elapsed < breakSecs) {
        return {
          level: lvl.level,
          remaining: breakSecs - elapsed,
          isOnBreak: true,
          breakDurationMins: breakDur,
          currentBlind: lvl,
          nextBlind: levels[i + 1],
          nextBreakIn: null,
        }
      }
      elapsed -= breakSecs
    }
  }

  // Past last level — stay on last level at 00:00
  const last = levels[levels.length - 1]
  return {
    level: last.level, remaining: 0, isOnBreak: false, breakDurationMins: 0,
    currentBlind: last, nextBlind: undefined, nextBreakIn: null,
  }
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
    <div style={{ background: '#130008', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #eab308', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  )

  const breaks = parseBreaks(t.breaks)
  const levelMins = t.minutesPerLevelPostLateReg ?? t.minutesPerLevelPreLateReg ?? 15
  const sortedLevels = [...t.blindLevels].sort((a, b) => a.level - b.level)

  const pos = calcPosition(t.startedAt, sortedLevels, breaks, levelMins, now)

  const { level, remaining, isOnBreak, breakDurationMins, currentBlind, nextBlind, nextBreakIn } = pos

  const active = t.players.filter(p => ['REGISTERED', 'ACTIVE', 'WINNER'].includes(p.status)).length
  const total = t.players.length
  const rebuys = t.players.reduce((s, p) => s + p.rebuysCount, 0)
  const addons = t.players.filter(p => p.hasAddon).length
  const totalChips = (total + rebuys + addons) * t.startingChips
  const avgStack = active > 0 ? Math.floor(totalChips / active) : 0
  const prize = parseFloat(t.prizePool)

  const timerColor = isOnBreak ? '#eab308' : '#D5DCEE'
  const glowColor = isOnBreak ? '#eab30830' : '#D5DCEE15'
  const bgColor = isOnBreak ? 'linear-gradient(160deg, #0d0800 0%, #1a1000 100%)' : 'linear-gradient(160deg, #130008 0%, #1f000d 100%)'
  const borderAccent = isOnBreak ? '#92400e' : '#7B0A40'

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      background: bgColor, fontFamily: 'system-ui, -apple-system, sans-serif', userSelect: 'none',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px 12px', flexShrink: 0 }}>
        <div style={{ color: '#7B0A40', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Stack+
        </div>
        <h1 style={{ color: '#D5DCEE', fontSize: 'clamp(1.2rem, 3vw, 2rem)', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>
          {t.name}
        </h1>
        <div style={{ color: '#7B0A40', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          {isOnBreak ? '☕ intervalo' : t.status === 'REGISTRATION' ? 'inscrições' : t.status === 'RUNNING' ? 'em andamento' : t.status === 'FINISHED' ? 'encerrado' : ''}
        </div>
      </div>

      <div style={{ height: 1, margin: '0 32px', background: `linear-gradient(90deg, transparent, ${isOnBreak ? '#92400e' : '#7B0A40'}, transparent)`, flexShrink: 0 }} />

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0, padding: '10px 20px 10px' }}>

        {/* Left: timer area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

          {/* Timer */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            borderRadius: 16, position: 'relative', overflow: 'hidden',
            background: isOnBreak ? 'linear-gradient(135deg, #1a0e00 0%, #2a1a00 100%)' : 'linear-gradient(135deg, #100006 0%, #1a000c 100%)',
            border: `1px solid ${borderAccent}`,
            boxShadow: `0 0 80px ${glowColor} inset`,
          }}
>
            {isOnBreak && (
              <div style={{
                position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                background: '#92400e30', border: '1px solid #92400e', borderRadius: 20,
                padding: '4px 16px', color: '#eab308', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.25em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>
                ☕ &nbsp;Intervalo — {breakDurationMins} minutos
              </div>
            )}
            <div style={{
              fontSize: 'clamp(5.5rem, 20vw, 14rem)',
              fontWeight: 900, color: timerColor, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              textShadow: `0 0 100px ${glowColor}`,
            }}>
              {timerStr(remaining)}
            </div>
          </div>

          {/* Nível / Blinds / Ante — bigger */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10, flexShrink: 0 }}>
            {[
              { label: 'Nível', value: String(level), mono: true },
              {
                label: 'Blinds',
                value: isOnBreak ? 'PAUSA' : currentBlind ? `${fmt(currentBlind.smallBlind)} / ${fmt(currentBlind.bigBlind)}` : '—',
                gold: isOnBreak,
                mono: true,
              },
              {
                label: 'Ante',
                value: currentBlind && currentBlind.ante > 0 ? fmt(currentBlind.ante) : '—',
                mono: true,
              },
            ].map(({ label, value, gold, mono }) => (
              <div key={label} style={{
                background: '#1a000e', border: `1px solid ${borderAccent}`,
                borderRadius: 12, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', padding: '14px 8px',
              }}>
                <div style={{ color: '#9080A0', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 'clamp(1.8rem, 4.5vw, 3.5rem)',
                  fontWeight: 900, color: gold ? '#eab308' : '#ffffff',
                  fontVariantNumeric: mono ? 'tabular-nums' : undefined,
                  lineHeight: 1,
                }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Próximo nível + Próx. intervalo — bigger */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
            {[
              {
                label: 'Próximo nível',
                value: nextBlind
                  ? `${fmt(nextBlind.smallBlind)} / ${fmt(nextBlind.bigBlind)}${nextBlind.ante > 0 ? ` / ${fmt(nextBlind.ante)}` : ''}`
                  : 'Último nível',
                highlight: false,
              },
              {
                label: isOnBreak ? 'Intervalo restante' : 'Próximo intervalo',
                value: isOnBreak ? timerStr(remaining) : nextBreakIn !== null ? timerStr(nextBreakIn) : '—',
                highlight: isOnBreak,
              },
            ].map(({ label, value, highlight }) => (
              <div key={label} style={{
                background: '#0f0009', border: `1px solid ${borderAccent}`,
                borderRadius: 12, display: 'flex', alignItems: 'center',
                gap: 12, padding: '12px 20px',
              }}>
                <span style={{ color: '#6a2040', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
                <span style={{
                  fontSize: 'clamp(1rem, 2vw, 1.5rem)',
                  fontWeight: 700, color: highlight ? '#eab308' : '#B7A0C0',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ width: 200, marginLeft: 12, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>

          {/* Status */}
          <div style={{ background: '#1a000e', border: `1px solid ${borderAccent}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ color: '#D5DCEE', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
              Status
            </div>
            {[['Jogadores', `${active} / ${total}`], ['Rebuys', rebuys], ['Add-ons', addons]].map(([k, v], i, arr) => (
              <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #2a0018' : 'none' }}>
                <span style={{ color: '#9080A0', fontSize: 13 }}>{k}</span>
                <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Estatísticas */}
          <div style={{ background: '#1a000e', border: `1px solid ${borderAccent}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ color: '#D5DCEE', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
              Estatísticas
            </div>
            {[['Stack médio', fmt(avgStack)], ['Total fichas', fmt(totalChips)]].map(([k, v], i) => (
              <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i === 0 ? '1px solid #2a0018' : 'none' }}>
                <span style={{ color: '#9080A0', fontSize: 13 }}>{k}</span>
                <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
              <span style={{ color: '#9080A0', fontSize: 13 }}>Prêmio</span>
              <span style={{ color: '#4ade80', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                R$ {prize.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Premiação */}
          {prize > 0 && (
            <div style={{ background: '#1a000e', border: `1px solid ${borderAccent}`, borderRadius: 12, padding: '14px 16px', flex: 1 }}>
              <div style={{ color: '#D5DCEE', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
                Premiação
              </div>
              {[
                { pos: '1º', pct: 50, color: '#fbbf24' },
                { pos: '2º', pct: 30, color: '#9ca3af' },
                { pos: '3º', pct: 20, color: '#b45309' },
              ].map(({ pos, pct, color }, i, arr) => (
                <div key={pos} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #2a0018' : 'none' }}>
                  <span style={{ color, fontSize: 14, fontWeight: 800 }}>{pos}</span>
                  <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {(prize * pct / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ height: 1, margin: '0 32px', background: `linear-gradient(90deg, transparent, ${isOnBreak ? '#92400e' : '#7B0A40'}, transparent)`, flexShrink: 0 }} />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, padding: '8px 0 10px', flexShrink: 0 }}>
        {[
          `Nível ${level}`,
          `${levelMins} min/nível`,
          t.lateRegistrationLevel ? `Late reg. até nível ${t.lateRegistrationLevel}` : null,
        ].filter(Boolean).map(s => (
          <span key={s!} style={{ color: '#7B0A40', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em' }}>{s}</span>
        ))}
      </div>
    </div>
  )
}
