'use client'

import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import EventTabs from '@/components/EventTabs'
import HomeGameTabs from '@/components/HomeGameTabs'
import { useAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'
import { useConfirm } from '@/components/ConfirmDialog'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlindLevel { level: number; smallBlind: number; bigBlind: number; ante: number }

interface TournamentPlayer {
  id: string
  playerId: string
  status: 'REGISTERED' | 'ACTIVE' | 'ELIMINATED' | 'WINNER'
  position: number | null
  rebuysCount: number
  hasAddon: boolean
  timeChipAwarded: boolean
  bountyCollected: string
  prizeAmount: string | null
  eliminatedAtLevel: number | null
  eliminatedByPlayerId: string | null
  registeredAt: string
  comanda: { id: string; balance: string }
  player: { id: string; name: string; cpf: string }
  eliminatedBy?: { id: string; player: { id: string; name: string } } | null
}

interface Tournament {
  id: string
  name: string
  status: 'REGISTRATION' | 'RUNNING' | 'ON_BREAK' | 'FINISHED' | 'CANCELED'
  buyInAmount: string
  buyInTaxAmount: string | null
  buyInTaxChips: number | null
  rebuyAmount: string | null
  rebuyTaxAmount: string | null
  rebuyTaxChips: number | null
  addonAmount: string | null
  addonTaxAmount: string | null
  addonTaxChips: number | null
  bountyAmount: string | null
  rake: string
  startingChips: number
  rebuyChips: number | null
  addonChips: number | null
  doubleBuyInBonusChips: number | null
  lateRegistrationLevel: number | null
  rebuyUntilLevel: number | null
  addonAfterLevel: number | null
  minutesPerLevelPreLateReg: number
  minutesPerLevelPostLateReg: number | null
  breaks: string | null
  currentLevel: number
  levelStartedAt: string | null
  isOnBreak: boolean
  breakStartedAt: string | null
  isPaused: boolean
  pausedAt: string | null
  dealPayouts: string | null
  payoutStructure: string | null
  prizePool: string
  totalRake: string
  totalTax: string
  doubleRebuyEnabled: boolean
  doubleRebuyBonusChips: number | null
  staffRetentionPct: string | null
  staffRetentionDest: string | null
  rankingRetentionPct: string | null
  timeChipBonus: number | null
  timeChipUntilLevel: number | null
  startedAt: string | null
  finishedAt: string | null
  homeGameId: string | null
  eventId: string | null
  blindLevels: BlindLevel[]
  players: TournamentPlayer[]
}

interface PayoutSuggestion {
  prizePool: string
  suggestion: Array<{ position: number; amount: number; percent: number }>
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: string | number) {
  return `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

// Calcula o prêmio esperado para uma posição com base na estrutura configurada
// Prioridade: dealPayouts → payoutStructure → null
function getExpectedPrize(position: number | null, tournament: Tournament): number | null {
  if (position == null) return null
  const prizePool = Number(tournament.prizePool)

  if (tournament.dealPayouts) {
    try {
      const payouts: { position: number; amount: number }[] = JSON.parse(tournament.dealPayouts)
      const entry = payouts.find((p) => p.position === position)
      if (entry) return entry.amount
    } catch {}
  }

  if (tournament.payoutStructure) {
    try {
      const structure: { position: number; percent: number }[] = JSON.parse(tournament.payoutStructure)
      const entry = structure.find((p) => p.position === position)
      if (entry) return Math.round(prizePool * entry.percent / 100 * 100) / 100
    } catch {}
  }

  return null
}

function elapsedSecondsFrom(startStr: string | null, referenceMs?: number): number {
  if (!startStr) return 0
  const val = Math.floor(((referenceMs ?? Date.now()) - new Date(startStr).getTime()) / 1000)
  return val < 0 ? 0 : val
}

// isPaused + pausedAt vêm do servidor — quando pausado, elapsed fica congelado
function useTimer(
  levelStartedAt: string | null,
  minutesPerLevel: number,
  isOnBreak: boolean,
  breakStartedAt: string | null,
  breakDurationMinutes: number | null,
  isPaused: boolean,
  pausedAt: string | null,
) {
  const startStr = isOnBreak ? breakStartedAt : levelStartedAt

  // Tick a cada segundo para forçar re-renders; elapsed é derivado diretamente
  // de startStr — evita estado obsoleto na transição nível → intervalo, que
  // causava overTime=true imediatamente ao entrar em break e encerrava o
  // intervalo em poucos segundos.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (isPaused) return
    const id = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [startStr, isPaused, pausedAt])

  // Quando pausado, congela no momento da pausa; caso contrário usa agora
  const effectiveNow = isPaused && pausedAt ? new Date(pausedAt).getTime() : Date.now()
  const elapsed = elapsedSecondsFrom(startStr, effectiveNow)

  const safeMins = (isOnBreak ? (breakDurationMinutes || 15) : (minutesPerLevel || 15))
  const totalSeconds = safeMins * 60
  const remaining = Math.max(0, totalSeconds - elapsed)
  const overTime = elapsed > totalSeconds

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return { display: `${mm}:${ss}`, overTime, elapsed }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TournamentPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [payout, setPayout] = useState<PayoutSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPayout, setShowPayout] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [registerBuyInType, setRegisterBuyInType] = useState<'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE' | null>(null)
  const [registerSelectedPlayer, setRegisterSelectedPlayer] = useState<{id: string, name: string} | null>(null)
  const [registerPaymentStep, setRegisterPaymentStep] = useState(false)
  const [registerPaymentMethod, setRegisterPaymentMethod] = useState<'PIX' | 'CASH' | 'CARD' | 'VOUCHER' | null>(null)
  const [registerPixResult, setRegisterPixResult] = useState<{
    qrCodeBase64: string | null
    pixCopyPaste: string | null
    amount: number
    itemId: string
    playerName: string
  } | null>(null)
  const [registerPixPaid, setRegisterPixPaid] = useState(false)
  const [registerPixCopied, setRegisterPixCopied] = useState(false)
  const [registerSignatureStep, setRegisterSignatureStep] = useState(false)
  const [registerHasSignature, setRegisterHasSignature] = useState(false)
  const registerSignatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const registerSignatureIsDrawingRef = useRef(false)
  const registerSignatureLastPosRef = useRef<{ x: number; y: number } | null>(null)
  const [editingBlinds, setEditingBlinds] = useState(false)
  const [editLevels, setEditLevels] = useState<{ level: number; smallBlind: number; bigBlind: number; ante: number }[]>([])
  const [editBreaks, setEditBreaks] = useState<{ id: string; afterLevel: string; durationMinutes: string }[]>([])
  const [registeringPlayerId, setRegisteringPlayerId] = useState<string | null>(null)
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cpfInput, setCpfInput] = useState('')
  const [cpfSearchResults, setCpfSearchResults] = useState<{id: string; name: string; cpf: string | null}[]>([])
  const [cpfSearching, setCpfSearching] = useState(false)
  const cpfDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedTab, setSelectedTab] = useState<'playing' | 'eliminated'>('playing')
  const [eliminateModal, setEliminateModal] = useState<TournamentPlayer | null>(null)
  const [eliminatorId, setEliminatorId] = useState('')
  const [rebuyModal, setRebuyModal] = useState<TournamentPlayer | null>(null)
  const [addonModal, setAddonModal] = useState<TournamentPlayer | null>(null)
  const [reEntrySelectedPlayer, setReEntrySelectedPlayer] = useState<TournamentPlayer | null>(null)
  const [reEntryType, setReEntryType] = useState<'NORMAL' | 'DOUBLE'>('NORMAL')
  const [reEntryWithAddon, setReEntryWithAddon] = useState(false)
  const [reEntryAddonWithTax, setReEntryAddonWithTax] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/tournaments/${tournamentId}`)
      setTournament(res.data)
      // Carrega membros do home game na primeira carga.
      // Inclui o HOST como opção também — o dono pode jogar o próprio torneio.
    } catch {
      setError('Torneio não encontrado')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  useEffect(() => { load() }, [load])

  // Polling durante torneio em andamento
  useEffect(() => {
    if (!tournament || !['RUNNING', 'ON_BREAK'].includes(tournament.status)) return
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
    // Dispara apenas quando o status muda; incluir o objeto tournament completo
    // causaria re-agendamento do interval a cada atualizacao parcial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.status, load])

  // Polling de status PIX na inscrição (a cada 3s enquanto aguardando pagamento)
  useEffect(() => {
    if (!registerPixResult || registerPixPaid) return
    let cancelled = false
    const poll = async () => {
      try {
        const { data } = await api.get(`/comanda/items/${registerPixResult.itemId}/pix-status`)
        if (cancelled) return
        if (data.status === 'PAID') {
          setRegisterPixPaid(true)
          load()
        }
      } catch {
        // silencioso — tenta novamente no próximo tick
      }
    }
    const id = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [registerPixResult, registerPixPaid, load])

  const action = async (fn: () => Promise<unknown>, key: string) => {
    setActionLoading(key)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro'))
    } finally {
      setActionLoading(null)
    }
  }

  const loadPayout = async () => {
    const res = await api.get(`/tournaments/${tournamentId}/payout-suggestion`)
    setPayout(res.data)
    setShowPayout(true)
  }

  const registerPlayer = async (signatureData?: string) => {
    if (!registerSelectedPlayer || !registerPaymentMethod) return
    setRegisteringPlayerId(registerSelectedPlayer.id)
    await action(async () => {
      const name = registerSelectedPlayer.name
      const amount = calcRegisterAmount(registerBuyInType ?? 'NORMAL')

      if (registerPaymentMethod === 'PIX') {
        // PIX: registra sem paymentMethod → gera cobrança PIX → exibe QR
        const { data: tpData } = await api.post(`/tournaments/${tournamentId}/players`, {
          playerId: registerSelectedPlayer.id,
          buyInType: registerBuyInType ?? 'NORMAL',
        })
        const comandaId: string = tpData.comandaItem.comandaId
        const tournamentPlayerId: string = tpData.id
        const { data: pixData } = await api.post(`/comanda/${comandaId}/pix-charge`, {
          amount,
          kind: 'SPOT',
          tournamentPlayerId,
        })
        setRegisterPixResult({
          qrCodeBase64: pixData.qrCodeBase64 ?? null,
          pixCopyPaste: pixData.pixCopyPaste ?? null,
          amount,
          itemId: pixData.item.id,
          playerName: name,
        })
        setRegisterPixPaid(false)
        setRegisterPixCopied(false)
        load()
      } else {
        await api.post(`/tournaments/${tournamentId}/players`, {
          playerId: registerSelectedPlayer.id,
          buyInType: registerBuyInType ?? 'NORMAL',
          paymentMethod: registerPaymentMethod,
          ...(signatureData ? { signatureData } : {}),
        })
        setRegisterSelectedPlayer(null)
        setRegisterBuyInType(null)
        setRegisterPaymentStep(false)
        setRegisterPaymentMethod(null)
        setRegisterSignatureStep(false)
        setRegisterHasSignature(false)
        setCpfInput('')
        setCpfSearchResults([])
        setRegisterSuccess(`${name} inscrito`)
        setTimeout(() => setRegisterSuccess(null), 3000)
      }
    }, 'register')
    setRegisteringPlayerId(null)
  }

  // Helpers para chips preview no modal de inscrição
  function calcRegisterChips(type: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE' | null) {
    if (!tournament) return 0
    const base = tournament.startingChips
    const taxChips = tournament.buyInTaxChips ?? 0
    const bonus = tournament.doubleBuyInBonusChips ?? 0
    const timeChipEligible = !!tournament.timeChipBonus && (
      tournament.status === 'REGISTRATION' ||
      tournament.currentLevel <= (tournament.timeChipUntilLevel ?? Infinity)
    )
    const timeChip = timeChipEligible ? (tournament.timeChipBonus ?? 0) : 0
    if (type === 'DOUBLE') return (base + taxChips) * 2 + bonus + timeChip
    if (type === 'NORMAL_WITH_TAX') return base + taxChips + timeChip
    return base + timeChip
  }
  function calcRegisterAmount(type: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE' | null) {
    if (!tournament) return 0
    const base = Number(tournament.buyInAmount)
    const tax = tournament.buyInTaxAmount ?? 0
    if (type === 'DOUBLE') return base * 2 + Number(tax) * 2
    if (type === 'NORMAL_WITH_TAX') return base + Number(tax)
    return base
  }

  const submitReEntry = async () => {
    if (!reEntrySelectedPlayer) return
    await action(async () => {
      const name = reEntrySelectedPlayer.player.name
      await api.post(`/tournaments/players/${reEntrySelectedPlayer.id}/re-entry`, {
        reEntryType,
        withAddon: reEntryWithAddon,
        withAddonTax: reEntryWithAddon && reEntryAddonWithTax,
      })
      setReEntrySelectedPlayer(null)
      setReEntryType('NORMAL')
      setReEntryWithAddon(false); setReEntryAddonWithTax(false)
      setCpfInput(''); setCpfSearchResults([])
      setRegisterSuccess(`Re-entrada: ${name}`)
      setTimeout(() => setRegisterSuccess(null), 3000)
    }, 'reentry')
  }

  function closeRegisterModal() {
    setShowRegister(false)
    setCpfInput('')
    setCpfSearchResults([])
    setCpfSearching(false)
    setRegisterSelectedPlayer(null)
    setRegisterBuyInType(null)
    setRegisterPaymentStep(false)
    setRegisterPaymentMethod(null)
    setRegisterPixResult(null)
    setRegisterPixPaid(false)
    setRegisterPixCopied(false)
    setRegisterSignatureStep(false)
    setRegisterHasSignature(false)
    setReEntrySelectedPlayer(null)
    setReEntryType('NORMAL')
    setReEntryWithAddon(false); setReEntryAddonWithTax(false)
  }

  if (loading) return <AppLoading />

  if (!tournament) return (
    <div className="min-h-screen bg-sx-bg flex items-center justify-center">
      <div className="text-red-400">{error}</div>
    </div>
  )

  const parsedBreaksMain: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] }
  })()
  const currentBreak = parsedBreaksMain.find((b) => b.afterLevel === tournament.currentLevel)
  const minutesPerLevel = tournament.isOnBreak
    ? (currentBreak?.durationMinutes ?? 15)
    : (tournament.lateRegistrationLevel != null && tournament.currentLevel > tournament.lateRegistrationLevel && tournament.minutesPerLevelPostLateReg)
      ? tournament.minutesPerLevelPostLateReg
      : tournament.minutesPerLevelPreLateReg

  const currentBlind = tournament.blindLevels.find((b) => b.level === tournament.currentLevel)

  const activePlayers = tournament.players
    .filter((p) => ['REGISTERED', 'ACTIVE', 'WINNER'].includes(p.status))
    .sort((a, b) => a.player.name.localeCompare(b.player.name, 'pt-BR', { sensitivity: 'base' }))
  const eliminatedPlayers = tournament.players.filter((p) => p.status === 'ELIMINATED')
    .sort((a, b) => (b.eliminatedAtLevel ?? 0) - (a.eliminatedAtLevel ?? 0))

  const filtered = (list: TournamentPlayer[]) =>
    list.filter((p) => p.player.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const statusBadge: Record<string, string> = {
    REGISTRATION: 'bg-blue-900/40 text-blue-300 border border-blue-700',
    RUNNING: 'bg-sx-cyan-deep/40 text-sx-cyan border border-sx-cyan-dim',
    ON_BREAK: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
    FINISHED: 'bg-sx-input text-sx-muted border border-sx-border2',
    CANCELED: 'bg-red-900/40 text-red-400 border border-red-700',
  }

  const statusLabel: Record<string, string> = {
    REGISTRATION: 'Inscrições',
    RUNNING: 'Rodando',
    ON_BREAK: 'Intervalo',
    FINISHED: 'Finalizado',
    CANCELED: 'Cancelado',
  }

  function generateHtmlReport() {
    const t = tournament!
    const fmt = (v: string | number | null | undefined) => {
      if (v == null) return 'R$ 0,00'
      return `R$ ${Math.abs(Number(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    }
    const totalPlayers = t.players.length
    const totalRebuys = t.players.reduce((s, p) => s + p.rebuysCount, 0)
    const totalAddons = t.players.filter(p => p.hasAddon).length
    const prizePool = Number(t.prizePool)
    const totalRake = Number(t.totalRake)
    const buyIn = Number(t.buyInAmount)
    const rebuy = Number(t.rebuyAmount ?? 0)
    const addon = Number(t.addonAmount ?? 0)

    const durationStr = (() => {
      if (!t.startedAt || !t.finishedAt) return '—'
      const ms = new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime()
      const h = Math.floor(ms / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      return h > 0 ? `${h}h ${m}min` : `${m}min`
    })()

    const sorted = [...t.players].sort((a, b) => {
      if (a.status === 'WINNER') return -1
      if (b.status === 'WINNER') return 1
      if (a.position != null && b.position != null) return a.position - b.position
      return 0
    })

    const medal = (pos: number | null) => {
      if (pos === 1) return '🥇'
      if (pos === 2) return '🥈'
      if (pos === 3) return '🥉'
      return pos != null ? `${pos}º` : '—'
    }

    const dealPayouts: { position: number; amount: number }[] = (() => {
      try { return t.dealPayouts ? JSON.parse(t.dealPayouts) : [] } catch { return [] }
    })()
    const payoutStructure: { position: number; percent: number }[] = (() => {
      try { return t.payoutStructure ? JSON.parse(t.payoutStructure) : [] } catch { return [] }
    })()

    const getPrize = (p: TournamentPlayer): number | null => {
      if (p.prizeAmount) return Number(p.prizeAmount)
      if (dealPayouts.length && p.position != null) {
        const e = dealPayouts.find(d => d.position === p.position)
        if (e) return e.amount
      }
      if (payoutStructure.length && p.position != null) {
        const e = payoutStructure.find(d => d.position === p.position)
        if (e) return Math.round(prizePool * e.percent / 100 * 100) / 100
      }
      return null
    }

    const playerRows = sorted.map((p, i) => {
      const prize = getPrize(p)
      const isWinner = p.status === 'WINNER'
      const bg = isWinner ? '#1a1500' : i % 2 === 0 ? '#0a1822' : '#071320'
      const borderLeft = isWinner ? '#FBBF24' : prize ? '#00C8E0' : 'transparent'
      const extras = [
        p.rebuysCount > 0 ? `${p.rebuysCount}× rebuy` : '',
        p.hasAddon ? 'add-on' : '',
        Number(p.bountyCollected) > 0 ? `bounty ${fmt(p.bountyCollected)}` : '',
      ].filter(Boolean).join(' · ')
      return `
        <tr style="background:${bg};border-left:3px solid ${borderLeft}">
          <td style="padding:10px 16px;font-size:16px;font-weight:800;color:${isWinner ? '#FBBF24' : '#6B7280'};width:44px">${medal(p.position)}</td>
          <td style="padding:10px 8px">
            <div style="font-weight:600;color:${isWinner ? '#FBBF24' : '#ffffff'};font-size:14px">${isWinner ? '🏆 ' : ''}${p.player.name}</div>
            ${extras ? `<div style="font-size:11px;color:#4A7A90;margin-top:2px">${extras}</div>` : ''}
            ${p.eliminatedBy ? `<div style="font-size:11px;color:#374151;margin-top:2px">eliminado por ${p.eliminatedBy.player.name}</div>` : ''}
          </td>
          <td style="padding:10px 16px;text-align:right;font-weight:700;font-size:14px;color:${prize ? '#4ade80' : '#374151'};white-space:nowrap">
            ${prize ? fmt(prize) : '—'}
          </td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Relatório — ${t.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#050D15;color:#fff;font-family:system-ui,-apple-system,sans-serif;min-height:100vh;padding:32px 16px 64px}
  .wrap{max-width:720px;margin:0 auto}
  h1{font-size:clamp(1.4rem,4vw,2rem);font-weight:900;letter-spacing:.05em}
  h2{font-size:.65rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#4A7A90;margin-bottom:12px}
  .card{background:linear-gradient(135deg,#0C2438,#071828 60%,#050D15);border:1px solid rgba(0,200,224,.14);border-radius:14px;padding:20px 24px}
  .grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:24px}
  .metric{background:linear-gradient(135deg,#0C2438,#071828 60%,#050D15);border:1px solid rgba(0,200,224,.12);border-radius:12px;padding:14px 16px}
  .metric .lbl{font-size:.7rem;color:#4A7A90;margin-bottom:4px}
  .metric .val{font-size:1.1rem;font-weight:800;font-variant-numeric:tabular-nums}
  .cyan{color:#00C8E0} .green{color:#4ade80} .yellow{color:#FBBF24} .orange{color:#fb923c} .muted{color:#6B7280}
  table{width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden}
  tr+tr{border-top:1px solid rgba(255,255,255,.04)}
  .divider{height:1px;background:linear-gradient(90deg,transparent,rgba(0,200,224,.15),transparent);margin:28px 0}
  .header-meta{font-size:.78rem;color:#4A7A90;margin-top:6px;line-height:1.6}
  .badge{display:inline-block;font-size:.65rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;padding:2px 10px;border-radius:20px;background:rgba(0,200,224,.1);border:1px solid rgba(0,200,224,.25);color:#00C8E0}
  .logo{font-size:.75rem;font-weight:900;letter-spacing:.25em;color:rgba(0,200,224,.35);text-transform:uppercase}
  @media print{body{background:#fff;color:#000}.card,.metric{background:#f9f9f9!important;border-color:#ddd!important}.cyan,.green,.yellow{color:#000!important}.logo{color:#999!important}}
</style>
</head>
<body>
<div class="wrap">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px">
    <div class="logo">STACK+</div>
    <div style="text-align:right;font-size:.7rem;color:#4A7A90">${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
  </div>

  <div class="card" style="margin-bottom:24px;border-color:rgba(0,200,224,.25)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
      <div>
        <h1>${t.name}</h1>
        <div class="header-meta">
          ${t.startedAt ? `Início: ${new Date(t.startedAt).toLocaleString('pt-BR')}` : ''}
          ${t.finishedAt ? ` &nbsp;·&nbsp; Fim: ${new Date(t.finishedAt).toLocaleString('pt-BR')}` : ''}
          ${durationStr !== '—' ? ` &nbsp;·&nbsp; Duração: ${durationStr}` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <span class="badge">${t.status === 'FINISHED' ? 'Finalizado' : t.status}</span>
        <div style="font-size:.7rem;color:#4A7A90;margin-top:6px">${totalPlayers} jogadores</div>
      </div>
    </div>
  </div>

  <div class="divider"></div>

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <h2 style="margin-bottom:0">Resumo financeiro</h2>
    ${t.eventId ? `<a href="/event/${t.eventId}/comandas" style="font-size:.72rem;font-weight:700;padding:5px 14px;border-radius:8px;background:rgba(0,200,224,.1);border:1px solid rgba(0,200,224,.3);color:#00C8E0;text-decoration:none">🗂️ Comandas</a>` : t.homeGameId ? `<a href="/homegame/${t.homeGameId}/comandas" style="font-size:.72rem;font-weight:700;padding:5px 14px;border-radius:8px;background:rgba(0,200,224,.1);border:1px solid rgba(0,200,224,.3);color:#00C8E0;text-decoration:none">🗂️ Comandas</a>` : ''}
  </div>
  <div class="grid">
    <div class="metric"><div class="lbl">Buy-ins (${totalPlayers}×)</div><div class="val">${fmt(buyIn * totalPlayers)}</div></div>
    ${totalRebuys > 0 ? `<div class="metric"><div class="lbl">Rebuys (${totalRebuys}×)</div><div class="val">${fmt(rebuy * totalRebuys)}</div></div>` : ''}
    ${totalAddons > 0 ? `<div class="metric"><div class="lbl">Add-ons (${totalAddons}×)</div><div class="val">${fmt(addon * totalAddons)}</div></div>` : ''}
    <div class="metric"><div class="lbl">Prize Pool</div><div class="val green">${fmt(prizePool)}</div></div>
    ${totalRake > 0 ? `<div class="metric"><div class="lbl">Rake</div><div class="val yellow">${fmt(totalRake)}</div></div>` : ''}
  </div>

  <div class="divider"></div>

  <h2>Classificação final</h2>
  <div style="border:1px solid rgba(0,200,224,.1);border-radius:12px;overflow:hidden">
    <table>
      <tbody>${playerRows}</tbody>
    </table>
  </div>

  <div style="margin-top:48px;text-align:center;font-size:.7rem;color:#1e3a50">
    Gerado por STACK+ &nbsp;·&nbsp; ${new Date().toLocaleString('pt-BR')}
  </div>

</div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  return (
    <div className="min-h-screen bg-sx-bg text-white pb-8">
      {confirmDialog}
      <AppHeader
        title={tournament.name}
        onBack={() => tournament.eventId
          ? router.push(`/event/${tournament.eventId}`)
          : router.push(`/homegame/${tournament.homeGameId}/tournaments`)
        }
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
        rightSlot={
          <a
            href={`/tournament/${tournamentId}/clock`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sx-muted hover:text-white px-3 py-1.5 bg-sx-input hover:bg-sx-card2 rounded-lg border border-sx-border2 whitespace-nowrap"
          >
            📺 Clock
          </a>
        }
      />
      {tournament.eventId
        ? <EventTabs eventId={tournament.eventId} active="MESAS" canManage={true} />
        : tournament.homeGameId
          ? <HomeGameTabs homeGameId={tournament.homeGameId} active="TOURNAMENTS" />
          : null
      }

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Timer */}
        {['RUNNING', 'ON_BREAK'].includes(tournament.status) && (
          <TimerCard
            tournament={tournament}
            currentBlind={currentBlind}
            onAdvance={() => action(() => api.post(`/tournaments/${tournamentId}/advance-level`), 'advance')}
            onPrevious={() => action(() => api.post(`/tournaments/${tournamentId}/previous-level`), 'previous')}
            onBreak={() => action(() => api.post(`/tournaments/${tournamentId}/start-break`), 'break')}
            onEndBreak={() => action(() => api.post(`/tournaments/${tournamentId}/end-break`), 'endbreak')}
            onPause={() => action(() => api.post(`/tournaments/${tournamentId}/pause`), 'pause')}
            onResume={() => action(() => api.post(`/tournaments/${tournamentId}/resume`), 'resume')}
            actionLoading={actionLoading}
            editingBlinds={editingBlinds}
            setEditingBlinds={setEditingBlinds}
            editLevels={editLevels}
            setEditLevels={setEditLevels}
            editBreaks={editBreaks}
            setEditBreaks={setEditBreaks}
            onSaveBlinds={async () => {
              const validBreaks = editBreaks.filter((b) => b.afterLevel).map((b) => ({ afterLevel: parseInt(b.afterLevel), durationMinutes: parseInt(b.durationMinutes) || 15 }))
              await action(() => api.patch(`/tournaments/${tournamentId}/blind-levels`, { levels: editLevels, breaks: validBreaks }), 'blinds')
              setEditingBlinds(false)
            }}
            onUpdateLimits={(addonAfterLevel) =>
              action(() => api.patch(`/tournaments/${tournamentId}/limits`, { addonAfterLevel }), 'limits')
            }
          />
        )}

        {/* Prize pool */}
        <div className="bg-sx-card rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-white/40 mb-1">Prize Pool</div>
            <div className="text-2xl font-bold text-green-400">{fmt(tournament.prizePool)}</div>
            {Number(tournament.totalRake) > 0 && (
              <div className="text-xs text-white/40 mt-0.5 flex items-center gap-2">
                <span>Rake: {fmt(tournament.totalRake)}</span>
                {Number(tournament.totalTax) > 0 && (
                  <span className="text-white/25">·</span>
                )}
                {Number(tournament.totalTax) > 0 && (
                  <span>Taxa: {fmt(tournament.totalTax)}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs text-white/40 tabular-nums">
              <span>
                <span className="text-white/60 font-semibold">{tournament.players.length}</span> buy-in{tournament.players.length !== 1 ? 's' : ''}
              </span>
              {!!tournament.rebuyAmount && (
                <>
                  <span className="text-white/20">·</span>
                  <span>
                    <span className="text-white/60 font-semibold">{tournament.players.reduce((s, p) => s + p.rebuysCount, 0)}</span> rebuy{tournament.players.reduce((s, p) => s + p.rebuysCount, 0) !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {!!tournament.addonAmount && (
                <>
                  <span className="text-white/20">·</span>
                  <span>
                    <span className="text-white/60 font-semibold">{tournament.players.filter(p => p.hasAddon).length}</span> add-on{tournament.players.filter(p => p.hasAddon).length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
          {['RUNNING', 'ON_BREAK'].includes(tournament.status) && (
            <button
              onClick={() => action(loadPayout, 'payout')}
              className="text-sm text-yellow-400 hover:text-white border border-yellow-600/30 rounded-lg px-3 py-2"
            >
              $ Payout · 🤝 Acordo
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-2 items-center overflow-x-auto pb-1">
          {(() => {
            const lateRegOpen = tournament.status === 'REGISTRATION' ||
              (tournament.status === 'RUNNING' &&
                (tournament.lateRegistrationLevel === null || tournament.currentLevel <= tournament.lateRegistrationLevel))
            const reEntryOpen = !!tournament.rebuyAmount &&
              (tournament.lateRegistrationLevel === null || tournament.currentLevel <= tournament.lateRegistrationLevel) &&
              eliminatedPlayers.length > 0
            if (!['REGISTRATION', 'RUNNING'].includes(tournament.status)) return null
            if (!lateRegOpen && !reEntryOpen) return null
            return (
              <button
                onClick={() => setShowRegister(true)}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium"
              >
                + Inscrever Jogador
              </button>
            )
          })()}
          {tournament.status === 'REGISTRATION' && (
            <button
              onClick={() => router.push(`/tournament/${tournamentId}/edit`)}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)', color: '#F59E0B' }}
            >
              ✏️ Editar Torneio
            </button>
          )}
          {tournament.status === 'REGISTRATION' && (
            <button
              onClick={() => action(() => api.post(`/tournaments/${tournamentId}/start`), 'start')}
              disabled={!!actionLoading || tournament.players.length < 2}
              className="px-4 py-2 bg-sx-cyan-dim hover:bg-sx-cyan rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Iniciar Torneio
            </button>
          )}
          {/* Encerrar Jogo — aparece quando todos os jogadores ativos têm prêmio definido (acordo confirmado) */}
          {['RUNNING', 'ON_BREAK'].includes(tournament.status) &&
            activePlayers.length >= 2 &&
            activePlayers.every((p) => !!p.prizeAmount) && (
            <button
              onClick={async () => {
                const ok = await confirm('Encerrar o torneio? Os jogadores ativos serão marcados com as posições finais.', { title: 'Encerrar torneio', confirmLabel: 'Encerrar', danger: true })
                if (ok) action(() => api.post(`/tournaments/${tournamentId}/finish-by-deal`), 'finish-deal')
              }}
              disabled={!!actionLoading}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              🏁 Encerrar Jogo
            </button>
          )}
          {tournament.players.length > 0 && (
            <button
              onClick={generateHtmlReport}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-sx-border2 text-sx-muted hover:text-white hover:border-white/20"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              📋 Encerrar torneio
            </button>
          )}
          <Link
            href={
              tournament.eventId
                ? `/event/${tournament.eventId}/comandas`
                : tournament.homeGameId
                  ? `/homegame/${tournament.homeGameId}/comandas`
                  : '#'
            }
            className="px-4 py-2 bg-sx-card2 hover:bg-sx-input rounded-lg text-sm font-medium border border-sx-border2 text-sx-muted hover:text-white"
          >
            🗂️ Comandas
          </Link>
        </div>

        {/* Search */}
        <input
          className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sx-cyan"
          placeholder="Buscar jogador..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Tabs */}
        <div className="flex border-b border-sx-border">
          <button
            onClick={() => setSelectedTab('playing')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${selectedTab === 'playing' ? 'border-sx-cyan text-white' : 'border-transparent text-white/40 hover:text-sx-cyan'}`}
          >
            Jogando ({activePlayers.length})
          </button>
          <button
            onClick={() => setSelectedTab('eliminated')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${selectedTab === 'eliminated' ? 'border-sx-cyan text-white' : 'border-transparent text-white/40 hover:text-sx-cyan'}`}
          >
            Eliminados ({eliminatedPlayers.length})
          </button>
        </div>

        {/* Player list */}
        <div className="rounded-xl overflow-hidden border border-white/5">
          {filtered(selectedTab === 'playing' ? activePlayers : eliminatedPlayers).map((p, i) => (
            <PlayerRow
              key={p.id}
              player={p}
              rowIndex={i}
              tournament={tournament}
              actionLoading={actionLoading}
              onRebuy={() => setRebuyModal(p)}
              onAddon={() => setAddonModal(p)}
              onEliminate={() => { setEliminateModal(p); setEliminatorId('') }}
              onPrize={() => {
                const amount = prompt(`Prêmio para ${p.player.name} (R$):`)
                if (amount) action(() => api.post(`/tournaments/players/${p.id}/prize`, { prizeAmount: parseFloat(amount) }), `prize-${p.id}`)
              }}
              onCancelRegistration={async () => {
                const ok = await confirm(`Cancelar inscrição de ${p.player.name}? O buy-in será estornado.`, { title: 'Cancelar inscrição', confirmLabel: 'Cancelar inscrição', danger: true })
                if (ok) action(() => api.delete(`/tournaments/players/${p.id}`), `cancel-${p.id}`)
              }}
            />
          ))}
          {filtered(selectedTab === 'playing' ? activePlayers : eliminatedPlayers).length === 0 && (
            <div className="text-center text-white/30 py-8 text-sm">
              {selectedTab === 'playing' ? 'Nenhum jogador inscrito' : 'Nenhum eliminado ainda'}
            </div>
          )}
        </div>

      </div>

      {/* Register modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.18)' }}>

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(registerSelectedPlayer || reEntrySelectedPlayer) && !registerPixResult && (
                  <button
                    onClick={() => {
                      setRegisterSelectedPlayer(null)
                      setRegisterBuyInType(null)
                      setRegisterPaymentStep(false)
                      setRegisterPaymentMethod(null)
                      setRegisterPixResult(null)
                      setRegisterPixPaid(false)
                      setRegisterPixCopied(false)
                      setReEntrySelectedPlayer(null)
                      setReEntryType('NORMAL')
                      setReEntryWithAddon(false); setReEntryAddonWithTax(false)
                    }}
                    className="text-sx-muted hover:text-white text-lg leading-none"
                  >
                    ←
                  </button>
                )}
                <h3 className="font-semibold text-white">
                  {reEntrySelectedPlayer ? 'Re-entrada' : 'Inscrever Jogador'}
                </h3>
              </div>
              <button onClick={closeRegisterModal} className="text-white/40 hover:text-white">✕</button>
            </div>

            {!registerSelectedPlayer && !reEntrySelectedPlayer ? (
              /* ── Step 1: selecionar jogador ou re-entrada ── */
              <>
                {registerSuccess && (
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium" style={{ background: 'rgba(0,200,130,0.12)', border: '1px solid rgba(0,200,130,0.25)', color: '#00E090' }}>
                    <span>✓</span>
                    <span>{registerSuccess}</span>
                  </div>
                )}
                {/* Busca por CPF */}
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-sx-cyan"
                      placeholder="Digite CPF ou parte dele..."
                      inputMode="numeric"
                      value={cpfInput}
                      autoFocus
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                        const masked = digits
                          .replace(/(\d{3})(\d)/, '$1.$2')
                          .replace(/(\d{3})(\d)/, '$1.$2')
                          .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
                        setCpfInput(masked)
                        setCpfSearchResults([])
                        if (cpfDebounceRef.current) clearTimeout(cpfDebounceRef.current)
                        if (digits.length < 3) { setCpfSearching(false); return }
                        setCpfSearching(true)
                        cpfDebounceRef.current = setTimeout(async () => {
                          try {
                            const res = await api.get(`/users/search?q=${digits}`)
                            const registeredIds = new Set(tournament.players.map((p) => p.playerId))
                            setCpfSearchResults(res.data.filter((u: {id: string}) => !registeredIds.has(u.id)))
                          } catch {
                            setCpfSearchResults([])
                          } finally {
                            setCpfSearching(false)
                          }
                        }, 400)
                      }}
                    />
                    {cpfSearching && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sx-muted text-xs">...</span>
                    )}
                  </div>

                  {/* Resultados da busca */}
                  {cpfSearchResults.length > 0 && (
                    <div className="space-y-1">
                      {cpfSearchResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => { setRegisterSelectedPlayer({ id: u.id, name: u.name }); setRegisterBuyInType('NORMAL') }}
                          className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors"
                          style={{ background: 'rgba(0,200,224,0.06)', border: '1px solid rgba(0,200,224,0.2)' }}
                          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(0,200,224,0.12)')}
                          onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(0,200,224,0.06)')}
                        >
                          <div>
                            <span className="font-medium text-white">{u.name}</span>
                            {u.cpf && <span className="text-sx-muted text-xs ml-2">{u.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</span>}
                          </div>
                          <span className="text-sx-cyan text-xs font-medium">Selecionar →</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {cpfSearchResults.length === 0 && !cpfSearching && cpfInput.replace(/\D/g, '').length >= 3 && (
                    <p className="text-center text-white/30 text-sm py-3">Nenhum jogador encontrado</p>
                  )}
                </div>

                {/* Re-entradas */}
                {(() => {
                  const canReEntry = !!tournament.rebuyAmount &&
                    (tournament.lateRegistrationLevel === null || tournament.currentLevel <= tournament.lateRegistrationLevel)
                  if (!canReEntry || eliminatedPlayers.length === 0) return null
                  return (
                    <div className="space-y-1">
                      <div className="text-xs text-white/35 uppercase tracking-widest pt-1 pb-1 px-1">↩ Re-entrada</div>
                      {eliminatedPlayers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setReEntrySelectedPlayer(p); setReEntryType('NORMAL'); setReEntryWithAddon(false); setReEntryAddonWithTax(false) }}
                          className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors"
                          style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.15)' }}
                          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(251,146,60,0.12)')}
                          onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(251,146,60,0.06)')}
                        >
                          <span className="font-medium text-white">{p.player.name}</span>
                          <span className="text-orange-400 text-xs font-medium">Re-entrada</span>
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </>
            ) : reEntrySelectedPlayer ? (
              /* ── Step 2: re-entrada ── */
              <>
                {/* Jogador selecionado */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-orange-400" style={{ background: 'rgba(251,146,60,0.12)' }}>
                    {reEntrySelectedPlayer.player.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-semibold text-white">{reEntrySelectedPlayer.player.name}</span>
                    <div className="text-xs text-white/40 mt-0.5">{reEntrySelectedPlayer.rebuysCount} rebuy{reEntrySelectedPlayer.rebuysCount !== 1 ? 's' : ''} anteriores</div>
                  </div>
                </div>

                {/* Tipo de re-entrada */}
                <div className="space-y-2">
                  <p className="text-xs text-sx-muted uppercase tracking-wider">Tipo de Re-entrada</p>
                  {[
                    { key: 'NORMAL' as const, label: 'Simples', chips: tournament.rebuyChips ?? tournament.startingChips, amount: Number(tournament.rebuyAmount) },
                    ...(tournament.doubleRebuyEnabled ? [{
                      key: 'DOUBLE' as const,
                      label: 'Dupla',
                      chips: (tournament.rebuyChips ?? tournament.startingChips) * 2,
                      amount: Number(tournament.rebuyAmount) * 2,
                    }] : []),
                  ].map((opt) => {
                    const isSelected = reEntryType === opt.key
                    const color = opt.key === 'DOUBLE'
                      ? 'linear-gradient(135deg, #FFB800 0%, #CC7000 100%)'
                      : 'linear-gradient(135deg, #00C8E0 0%, #007A95 100%)'
                    const glow = opt.key === 'DOUBLE'
                      ? '0 4px 16px rgba(255,184,0,0.3)'
                      : '0 4px 16px rgba(0,200,224,0.3)'
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setReEntryType(opt.key)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
                        style={{
                          background: isSelected ? color : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                          boxShadow: isSelected ? glow : 'none',
                        }}
                      >
                        <div>
                          <p className="text-sm font-bold" style={{ color: isSelected ? '#050D15' : 'rgba(255,255,255,0.7)' }}>{opt.label}</p>
                          <p className="text-xs mt-0.5" style={{ color: isSelected ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                            {opt.chips.toLocaleString('pt-BR')} fichas
                          </p>
                        </div>
                        <span className="text-base font-black" style={{ color: isSelected ? '#050D15' : 'white' }}>
                          {fmt(opt.amount)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Addon (se disponível neste nível e jogador ainda não fez) */}
                {!!tournament.addonAmount && !reEntrySelectedPlayer.hasAddon &&
                  (tournament.addonAfterLevel === null || tournament.currentLevel >= (tournament.addonAfterLevel ?? 0)) && (() => {
                  const addonBase      = Number(tournament.addonAmount)
                  const addonTax       = Number(tournament.addonTaxAmount ?? 0)
                  const addonBaseChips = tournament.addonChips ?? tournament.startingChips
                  const addonTaxChips  = Number(tournament.addonTaxChips ?? 0)
                  return (
                    <>
                      {/* Addon base — selecionado exclusivamente (sem taxa) */}
                      {(() => {
                        const selected = reEntryWithAddon && !reEntryAddonWithTax
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              if (selected) {
                                // deseleciona
                                setReEntryWithAddon(false)
                                setReEntryAddonWithTax(false)
                              } else {
                                // seleciona addon simples, remove taxa
                                setReEntryWithAddon(true)
                                setReEntryAddonWithTax(false)
                              }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left"
                            style={{
                              background: selected ? 'linear-gradient(135deg, #00E0A0 0%, #00957A 100%)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${selected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                              boxShadow: selected ? '0 4px 16px rgba(0,224,160,0.3)' : 'none',
                            }}
                          >
                            <span className="text-lg">{selected ? '☑' : '☐'}</span>
                            <div className="flex-1">
                              <p className="text-sm font-bold" style={{ color: selected ? '#050D15' : 'rgba(255,255,255,0.7)' }}>
                                Incluir Add-on
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: selected ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                                +{addonBaseChips.toLocaleString('pt-BR')} fichas
                              </p>
                            </div>
                            <span className="text-base font-black" style={{ color: selected ? '#050D15' : 'white' }}>
                              {fmt(addonBase)}
                            </span>
                          </button>
                        )
                      })()}

                      {/* Addon com taxa — opção exclusiva (addon + taxa juntos) */}
                      {addonTax > 0 && (() => {
                        const selected = reEntryWithAddon && reEntryAddonWithTax
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              if (selected) {
                                // deseleciona tudo
                                setReEntryWithAddon(false)
                                setReEntryAddonWithTax(false)
                              } else {
                                // seleciona addon + taxa, remove addon simples
                                setReEntryWithAddon(true)
                                setReEntryAddonWithTax(true)
                              }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left"
                            style={{
                              background: selected ? 'linear-gradient(135deg, #00E0A0 0%, #00957A 100%)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${selected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                              boxShadow: selected ? '0 4px 16px rgba(0,224,160,0.3)' : 'none',
                            }}
                          >
                            <span className="text-lg">{selected ? '☑' : '☐'}</span>
                            <div className="flex-1">
                              <p className="text-sm font-bold" style={{ color: selected ? '#050D15' : 'rgba(255,255,255,0.7)' }}>
                                Taxa do Add-on
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: selected ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                                +{(addonBaseChips + addonTaxChips).toLocaleString('pt-BR')} fichas
                              </p>
                            </div>
                            <span className="text-base font-black" style={{ color: selected ? '#050D15' : 'white' }}>
                              {fmt(addonBase + addonTax)}
                            </span>
                          </button>
                        )
                      })()}
                    </>
                  )
                })()}

                {/* Preview total */}
                {(() => {
                  const rebuyMult       = reEntryType === 'DOUBLE' ? 2 : 1
                  const rebuyAmt        = Number(tournament.rebuyAmount) * rebuyMult
                  const addonAmt        = reEntryWithAddon ? Number(tournament.addonAmount ?? 0) : 0
                  const addonTaxAmt     = reEntryWithAddon && reEntryAddonWithTax ? Number(tournament.addonTaxAmount ?? 0) : 0
                  const rebuyChips      = (tournament.rebuyChips ?? tournament.startingChips) * rebuyMult
                  const addonChipsAmt   = reEntryWithAddon ? (tournament.addonChips ?? tournament.startingChips) : 0
                  const addonTaxChipsAmt = reEntryWithAddon && reEntryAddonWithTax ? Number(tournament.addonTaxChips ?? 0) : 0
                  return (
                    <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,146,60,0.15)' }}>
                      <p className="text-xs text-sx-muted mb-1">
                        Total · {fmt(rebuyAmt + addonAmt + addonTaxAmt)}
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white">
                          {(rebuyChips + addonChipsAmt + addonTaxChipsAmt).toLocaleString('pt-BR')}
                        </span>
                        <span className="text-sx-muted text-sm">fichas</span>
                      </div>
                    </div>
                  )
                })()}

                {/* Erro */}
                {error && (
                  <div className="rounded-xl px-3 py-2 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </div>
                )}

                {/* Confirmar */}
                <button
                  onClick={submitReEntry}
                  disabled={!!actionLoading}
                  className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FB923C 0%, #C2410C 100%)' }}
                >
                  {actionLoading === 'reentry' ? 'Processando...' : 'Confirmar Re-entrada'}
                </button>
              </>
            ) : (
              /* ── Step 2: escolher tipo de buy-in ── */
              <>
                {/* Jogador selecionado */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.15)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-sx-cyan" style={{ background: 'rgba(0,200,224,0.12)' }}>
                    {registerSelectedPlayer!.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-white">{registerSelectedPlayer!.name}</span>
                </div>

                {/* Seleção de tipo de buy-in */}
                <BuyInSelector
                  baseAmount={Number(tournament.buyInAmount)}
                  taxAmount={Number(tournament.buyInTaxAmount ?? 0)}
                  taxChips={Number(tournament.buyInTaxChips ?? 0)}
                  startingChips={tournament.startingChips}
                  doubleBonusChips={tournament.doubleBuyInBonusChips ?? 0}
                  selected={registerBuyInType ?? 'NORMAL'}
                  onChange={(t) => setRegisterBuyInType(t)}
                />

                {/* Preview de fichas */}
                {(() => {
                  const timeChipEligible = !!tournament.timeChipBonus && (
                    tournament.status === 'REGISTRATION' ||
                    tournament.currentLevel <= (tournament.timeChipUntilLevel ?? Infinity)
                  )
                  return (
                    <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
                      <p className="text-xs text-sx-muted mb-1">Fichas a entregar · {fmt(calcRegisterAmount(registerBuyInType))}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white">
                          {calcRegisterChips(registerBuyInType).toLocaleString('pt-BR')}
                        </span>
                        <span className="text-sx-muted text-sm">fichas</span>
                      </div>
                      {timeChipEligible && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)' }}>
                            TIME CHIP
                          </span>
                          <span className="text-xs text-sx-muted">
                            inclui <span className="text-white font-medium">+{tournament.timeChipBonus!.toLocaleString('pt-BR')}</span> por inscrição antecipada
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Erro de inscrição */}
                {error && (
                  <div className="rounded-xl px-3 py-2 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </div>
                )}

                {registerPixResult ? (
                  /* Step 4: QR code PIX */
                  <div className="space-y-3">
                    {registerPixPaid ? (
                      <div className="rounded-xl px-4 py-4 text-center space-y-2" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                        <div className="text-2xl">✓</div>
                        <p className="text-sm font-semibold text-green-400">{registerPixResult.playerName} inscrito — PIX confirmado!</p>
                        <button
                          type="button"
                          onClick={closeRegisterModal}
                          className="mt-2 w-full py-2 rounded-xl text-sm font-semibold btn-sx-primary"
                        >
                          Fechar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-xs text-sx-muted">
                          <div className="w-2 h-2 rounded-full bg-sx-cyan animate-pulse" />
                          Aguardando pagamento PIX — {registerPixResult.playerName}
                        </div>

                        {registerPixResult.qrCodeBase64 && (
                          <div className="rounded-lg bg-white p-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={registerPixResult.qrCodeBase64} alt="QR Code PIX" className="w-full h-auto" />
                          </div>
                        )}

                        {registerPixResult.pixCopyPaste && (
                          <div className="space-y-2">
                            <p className="text-xs text-white/40 uppercase tracking-wide">PIX Copia e Cola</p>
                            <textarea
                              readOnly
                              value={registerPixResult.pixCopyPaste}
                              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono h-20 resize-none"
                              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (registerPixResult.pixCopyPaste) {
                                  navigator.clipboard.writeText(registerPixResult.pixCopyPaste)
                                  setRegisterPixCopied(true)
                                  setTimeout(() => setRegisterPixCopied(false), 1500)
                                }
                              }}
                              className="w-full rounded-lg border border-sx-cyan/40 bg-sx-cyan/10 hover:bg-sx-cyan/20 px-3 py-2 text-sm font-bold text-sx-cyan"
                            >
                              {registerPixCopied ? '✓ Copiado!' : 'Copiar PIX'}
                            </button>
                          </div>
                        )}

                        {!registerPixResult.qrCodeBase64 && !registerPixResult.pixCopyPaste && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            Cobrança gerada, mas QR/copia-e-cola não retornou. Verifique o extrato Annapay.
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={closeRegisterModal}
                          className="w-full py-2 rounded-xl text-sm font-semibold"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                        >
                          Fechar (aguardar depois)
                        </button>
                      </>
                    )}
                  </div>
                ) : registerSignatureStep ? (
                  /* Step 4: Assinatura VOUCHER */
                  <div className="space-y-3">
                    <p className="text-xs text-sx-muted uppercase tracking-widest">Assinatura do jogador</p>
                    <div
                      className="relative w-full rounded-xl overflow-hidden"
                      style={{ height: 200, border: '2px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}
                    >
                      <canvas
                        ref={registerSignatureCanvasRef}
                        width={800}
                        height={400}
                        style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
                        onPointerDown={(e) => {
                          const canvas = registerSignatureCanvasRef.current
                          if (!canvas) return
                          registerSignatureIsDrawingRef.current = true
                          const rect = canvas.getBoundingClientRect()
                          const scaleX = canvas.width / rect.width
                          const scaleY = canvas.height / rect.height
                          registerSignatureLastPosRef.current = {
                            x: (e.clientX - rect.left) * scaleX,
                            y: (e.clientY - rect.top) * scaleY,
                          }
                          canvas.setPointerCapture(e.pointerId)
                        }}
                        onPointerMove={(e) => {
                          if (!registerSignatureIsDrawingRef.current) return
                          const canvas = registerSignatureCanvasRef.current
                          if (!canvas || !registerSignatureLastPosRef.current) return
                          const ctx = canvas.getContext('2d')
                          if (!ctx) return
                          const rect = canvas.getBoundingClientRect()
                          const scaleX = canvas.width / rect.width
                          const scaleY = canvas.height / rect.height
                          const x = (e.clientX - rect.left) * scaleX
                          const y = (e.clientY - rect.top) * scaleY
                          ctx.beginPath()
                          ctx.moveTo(registerSignatureLastPosRef.current.x, registerSignatureLastPosRef.current.y)
                          ctx.lineTo(x, y)
                          ctx.strokeStyle = '#00C8E0'
                          ctx.lineWidth = 3
                          ctx.lineCap = 'round'
                          ctx.lineJoin = 'round'
                          ctx.stroke()
                          registerSignatureLastPosRef.current = { x, y }
                          setRegisterHasSignature(true)
                        }}
                        onPointerUp={() => {
                          registerSignatureIsDrawingRef.current = false
                          registerSignatureLastPosRef.current = null
                        }}
                      />
                      {!registerHasSignature && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <p className="text-sm select-none" style={{ color: 'rgba(255,255,255,0.25)' }}>Assine aqui</p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const canvas = registerSignatureCanvasRef.current
                        if (canvas) {
                          const ctx = canvas.getContext('2d')
                          ctx?.clearRect(0, 0, canvas.width, canvas.height)
                          setRegisterHasSignature(false)
                        }
                      }}
                      className="text-xs text-sx-muted hover:text-zinc-300 underline"
                    >
                      Limpar assinatura
                    </button>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setRegisterSignatureStep(false)}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                      >
                        ← Voltar
                      </button>
                      <button
                        type="button"
                        disabled={!registerHasSignature || !!actionLoading}
                        onClick={() => {
                          const canvas = registerSignatureCanvasRef.current
                          if (!canvas) return
                          const signatureData = canvas.toDataURL('image/png')
                          registerPlayer(signatureData)
                        }}
                        className="flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-40 btn-sx-primary"
                      >
                        {actionLoading === 'register' ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                            Inscrevendo...
                          </span>
                        ) : 'Confirmar Inscrição'}
                      </button>
                    </div>
                  </div>
                ) : !registerPaymentStep ? (
                  /* Step 2 → ir para pagamento */
                  <button
                    onClick={() => { setRegisterPaymentStep(true); setRegisterPaymentMethod(null) }}
                    disabled={!!actionLoading}
                    className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 btn-sx-primary"
                  >
                    Escolher Pagamento →
                  </button>
                ) : (
                  /* Step 3: selecionar forma de pagamento */
                  <div className="space-y-3">
                    <p className="text-xs text-sx-muted uppercase tracking-widest">Forma de pagamento</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: 'PIX',     label: 'PIX' },
                        { key: 'CASH',    label: 'Dinheiro' },
                        { key: 'CARD',    label: 'Cartão' },
                        { key: 'VOUCHER', label: 'Vale' },
                      ] as { key: 'PIX' | 'CASH' | 'CARD' | 'VOUCHER'; label: string }[]).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setRegisterPaymentMethod(key)}
                          className="py-3 rounded-xl text-sm font-semibold border transition-colors"
                          style={registerPaymentMethod === key
                            ? { background: 'rgba(0,200,224,0.18)', border: '1px solid rgba(0,200,224,0.6)', color: '#00C8E0' }
                            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => { setRegisterPaymentStep(false); setRegisterPaymentMethod(null) }}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                      >
                        ← Voltar
                      </button>
                      <button
                        onClick={registerPaymentMethod === 'VOUCHER' ? () => setRegisterSignatureStep(true) : registerPlayer}
                        disabled={!registerPaymentMethod || !!actionLoading}
                        className="flex-2 flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-40 btn-sx-primary"
                      >
                        {actionLoading === 'register' ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                            Inscrevendo...
                          </span>
                        ) : registerPaymentMethod === 'VOUCHER' ? 'Assinar →' : 'Confirmar Inscrição'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Rebuy modal */}
      {rebuyModal && (() => {
        const baseAmount = Number(tournament.rebuyAmount)
        const taxAmount = Number(tournament.rebuyTaxAmount ?? 0)
        const baseChips = tournament.rebuyChips ?? tournament.startingChips
        const taxChips = Number(tournament.rebuyTaxChips ?? 0)
        return (
          <ActionModal
            title={`Rebuy — ${rebuyModal.player.name}`}
            baseLabel="Simples"
            baseAmount={baseAmount}
            taxAmount={taxAmount}
            baseChips={baseChips}
            taxChips={taxChips}
            hasDouble={tournament.doubleRebuyEnabled}
            actionLoading={actionLoading}
            onClose={() => setRebuyModal(null)}
            onConfirm={(type) => {
              action(() => api.post(`/tournaments/players/${rebuyModal.id}/rebuy`, { rebuyType: type }), `rebuy-${rebuyModal.id}`)
              setRebuyModal(null)
            }}
          />
        )
      })()}

      {/* Addon modal */}
      {addonModal && (() => {
        const baseAmount = Number(tournament.addonAmount)
        const taxAmount = Number(tournament.addonTaxAmount ?? 0)
        const baseChips = tournament.addonChips ?? tournament.startingChips
        const taxChips = Number(tournament.addonTaxChips ?? 0)
        return (
          <ActionModal
            title={`Add-on — ${addonModal.player.name}`}
            baseLabel="Simples"
            baseAmount={baseAmount}
            taxAmount={taxAmount}
            baseChips={baseChips}
            taxChips={taxChips}
            actionLoading={actionLoading}
            onClose={() => setAddonModal(null)}
            onConfirm={(type) => {
              action(() => api.post(`/tournaments/players/${addonModal.id}/addon`, { withTax: type !== 'NORMAL' }), `addon-${addonModal.id}`)
              setAddonModal(null)
            }}
          />
        )
      })()}

      {/* Eliminate modal */}
      {eliminateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-sx-card rounded-2xl w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Eliminar {eliminateModal.player.name}</h3>
              <button onClick={() => setEliminateModal(null)} className="text-white/40">✕</button>
            </div>
            {tournament.bountyAmount && (
              <div>
                <label className="block text-xs text-sx-muted mb-1">Quem eliminou? (bounty)</label>
                <select
                  className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={eliminatorId}
                  onChange={(e) => setEliminatorId(e.target.value)}
                >
                  <option value="">Ninguém / Não registrar</option>
                  {activePlayers.filter((p) => p.id !== eliminateModal.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.player.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              disabled={!!actionLoading}
              onClick={() => action(async () => {
                await api.post(`/tournaments/players/${eliminateModal.id}/eliminate`, {
                  eliminatedByPlayerId: eliminatorId || null,
                })
                setEliminateModal(null)
              }, `elim-${eliminateModal.id}`)}
              className="w-full py-3 bg-red-700 hover:bg-red-600 rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {actionLoading ? 'Processando...' : 'Confirmar Eliminação'}
            </button>
          </div>
        </div>
      )}

      {/* Payout modal */}
      {showPayout && payout && (
        <PayoutModal
          payout={payout}
          players={tournament.players}
          tournamentId={tournamentId}
          actionLoading={actionLoading}
          onClose={() => { setShowPayout(false); load() }}
          onPay={async (playerId, amount) => {
            await action(async () => {
              await api.post(`/tournaments/players/${playerId}/prize`, { prizeAmount: amount })
            }, `prize-${playerId}`)
          }}
          onFinishByDeal={async () => {
            await action(() => api.post(`/tournaments/${tournamentId}/finish-by-deal`), 'finish-deal')
          }}
          onSetDealPayouts={async (payouts) => {
            await action(() => api.post(`/tournaments/${tournamentId}/set-deal-payouts`, { payouts }), 'set-deal-payouts')
          }}
          onSetPayoutStructure={async (structure) => {
            await action(() => api.post(`/tournaments/${tournamentId}/set-payout-structure`, { structure }), 'set-payout-structure')
          }}
        />
      )}
    </div>
  )
}

// ─── Timer Card ───────────────────────────────────────────────────────────────

function TimerCard({ tournament, currentBlind, onAdvance, onPrevious, onBreak, onEndBreak, onPause, onResume, actionLoading, editingBlinds, setEditingBlinds, editLevels, setEditLevels, editBreaks, setEditBreaks, onSaveBlinds, onUpdateLimits }: {
  tournament: Tournament
  currentBlind: BlindLevel | undefined
  onAdvance: () => void
  onPrevious: () => void
  onBreak: () => void
  onEndBreak: () => void
  onPause: () => void
  onResume: () => void
  actionLoading: string | null
  editingBlinds: boolean
  setEditingBlinds: (v: boolean) => void
  editLevels: { level: number; smallBlind: number; bigBlind: number; ante: number }[]
  setEditLevels: React.Dispatch<React.SetStateAction<{ level: number; smallBlind: number; bigBlind: number; ante: number }[]>>
  editBreaks: { id: string; afterLevel: string; durationMinutes: string }[]
  setEditBreaks: React.Dispatch<React.SetStateAction<{ id: string; afterLevel: string; durationMinutes: string }[]>>
  onSaveBlinds: () => Promise<void>
  onUpdateLimits: (addonAfterLevel: number | null) => void
}) {
  const parsedBreaksTimer: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] }
  })()

  const nextBreak = parsedBreaksTimer.find((b) => b.afterLevel === tournament.currentLevel)
  const activeBreak = parsedBreaksTimer.find((b) => b.afterLevel === tournament.currentLevel)
  const breakDuration = activeBreak?.durationMinutes || 15

  const minutesPerLevel = tournament.isOnBreak
    ? breakDuration
    : (tournament.lateRegistrationLevel != null && tournament.currentLevel > tournament.lateRegistrationLevel && tournament.minutesPerLevelPostLateReg)
      ? tournament.minutesPerLevelPostLateReg
      : (tournament.minutesPerLevelPreLateReg || 15)

  const { display, overTime } = useTimer(
    tournament.levelStartedAt,
    minutesPerLevel,
    tournament.isOnBreak,
    tournament.breakStartedAt,
    breakDuration,
    tournament.isPaused,
    tournament.pausedAt,
  )

  const isPaused = tournament.isPaused
  const isBreak = tournament.isOnBreak

  // Próxima blind
  const sortedLevels = [...tournament.blindLevels].sort((a, b) => a.level - b.level)
  const nextBlind = sortedLevels.find((l) => l.level === tournament.currentLevel + 1)

  // Auto-avança para o próximo nível quando o tempo esgota
  // Se há intervalo configurado após o nível atual, entra em break em vez de avançar
  const autoAdvancedRef = useRef(false)
  const autoBreakEndedRef = useRef(false)
  useEffect(() => { autoAdvancedRef.current = false }, [tournament.levelStartedAt])
  useEffect(() => { autoBreakEndedRef.current = false }, [tournament.breakStartedAt])
  useEffect(() => {
    if (overTime && !isBreak && !isPaused && !actionLoading && !autoAdvancedRef.current) {
      autoAdvancedRef.current = true
      if (nextBreak) {
        onBreak()
      } else {
        onAdvance()
      }
    }
    // nextBreak/onAdvance/onBreak sao capturados no closure; dispara apenas
    // quando os sinais primarios (overTime/isBreak/isPaused/actionLoading) mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overTime, isBreak, isPaused, actionLoading])
  // Auto-encerra intervalo quando o tempo do break esgota
  useEffect(() => {
    if (overTime && isBreak && !isPaused && !actionLoading && !autoBreakEndedRef.current) {
      autoBreakEndedRef.current = true
      onEndBreak()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overTime, isBreak, isPaused, actionLoading])

  const accent = isBreak ? 'border-yellow-700 bg-yellow-900/20' : 'border-white/8 bg-sx-card'
  const timerColor = overTime ? '#f87171'
    : isBreak ? (isPaused ? '#854d0e' : '#eab308')
    : (isPaused ? 'rgba(255,255,255,0.25)' : '#ffffff')

  return (
    <div className={`rounded-xl border ${accent} overflow-hidden`}>

      {/* Corpo principal: blinds + timer */}
      <div className="flex items-start gap-4">

        {/* Blinds atuais */}
        <div className="flex-1 min-w-0 px-4 pt-4 pb-3">
          {isBreak ? (
            <>
              <div className="text-xs font-semibold tracking-widest uppercase text-yellow-600 mb-1">Intervalo</div>
              <div className="text-2xl font-bold text-yellow-400">{breakDuration} minutos</div>
              {isPaused && <div className="text-xs text-white/30 mt-1">pausado</div>}
            </>
          ) : (
            <>
              <div className="text-xs font-semibold tracking-widest uppercase text-sx-muted mb-1">
                Nível {tournament.currentLevel}{isPaused && <span className="ml-2 text-white/25">· pausado</span>}
              </div>
              {currentBlind ? (
                <div className="text-2xl font-bold text-white leading-tight">
                  {currentBlind.smallBlind.toLocaleString()} / {currentBlind.bigBlind.toLocaleString()}
                  {currentBlind.ante > 0 && (
                    <span className="text-base font-normal text-white/50 ml-2">Ante {currentBlind.ante.toLocaleString()}</span>
                  )}
                </div>
              ) : (
                <div className="text-2xl font-bold text-white/30">—</div>
              )}
              {/* Próximo nível */}
              {nextBlind && !isBreak && (
                <div className="mt-2 text-xs text-white/35">
                  Próximo · {nextBlind.smallBlind.toLocaleString()} / {nextBlind.bigBlind.toLocaleString()}
                  {nextBlind.ante > 0 && ` · Ante ${nextBlind.ante.toLocaleString()}`}
                  {nextBreak && <span className="ml-2 text-yellow-600">· intervalo após</span>}
                </div>
              )}

            </>
          )}
        </div>

        {/* Timer grande */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 flex items-center">
          <div
            className="font-mono font-black tabular-nums leading-none"
            style={{ fontSize: 'clamp(2.8rem, 6vw, 3.8rem)', color: timerColor }}
          >
            {overTime && !isBreak ? '+' : ''}{display}
          </div>
        </div>
      </div>

      {/* Barra de controles */}
      <div className="flex gap-2 px-3 pb-3 border-t border-white/5 pt-3">

        {isBreak ? (
          /* Durante intervalo: pausar + encerrar intervalo */
          <>
            <button
              onClick={isPaused ? onResume : onPause}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-sx-input hover:bg-sx-card2 border border-sx-border2 text-white/60 disabled:opacity-50"
            >
              {isPaused ? '▶ Continuar' : '⏸ Pausar'}
            </button>
            <button
              onClick={onEndBreak}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Encerrar Intervalo
            </button>
          </>
        ) : (
          /* Durante blind normal: voltar · pausar · próximo */
          <>
            <button
              onClick={onPrevious}
              disabled={!!actionLoading || tournament.currentLevel <= 1}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-sx-input hover:bg-sx-card2 border border-sx-border2 text-white/60 disabled:opacity-30"
            >
              ◀ Anterior
            </button>
            <button
              onClick={isPaused ? onResume : onPause}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-sx-input hover:bg-sx-card2 border border-sx-border2 text-white/60 disabled:opacity-50"
            >
              {isPaused ? '▶ Continuar' : '⏸ Pausar'}
            </button>
            <button
              onClick={nextBreak ? onBreak : onAdvance}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {nextBreak ? 'Intervalo ▶' : 'Próximo ▶'}
            </button>
          </>
        )}
      </div>

      {/* Botão editar estrutura de blinds — abaixo dos controles */}
      {!editingBlinds && (
        <div className="px-3 pb-3 flex items-center gap-4 flex-wrap border-t border-white/5 pt-3">
          <button
            onClick={() => {
              const parsedBreaks: { afterLevel: number; durationMinutes: number }[] = (() => { try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] } })()
              setEditLevels(tournament.blindLevels.map((l) => ({ ...l })))
              setEditBreaks(parsedBreaks.map((b, i) => ({ id: String(i), afterLevel: String(b.afterLevel), durationMinutes: String(b.durationMinutes) })))
              setEditingBlinds(true)
            }}
            className="text-xs text-sx-cyan hover:text-white"
          >
            ✎ Editar blinds
          </button>
          {(!!tournament.rebuyAmount || !!tournament.addonAmount) && (
            <InlineLimitsEditor
              tournament={tournament}
              onSave={onUpdateLimits}
              actionLoading={actionLoading}
            />
          )}
        </div>
      )}

      {/* Editor full-width — aparece quando editingBlinds === true */}
      {editingBlinds && (
        <div className="border-t border-white/10 px-3 pb-4 pt-3 space-y-3">
          <div className="text-xs text-sx-muted uppercase tracking-widest font-medium mb-2">Editar estrutura de blinds</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              <col />
              <col />
              <col />
              <col style={{ width: '28px' }} />
            </colgroup>
            <thead>
              <tr style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', paddingBottom: '4px' }}>Nível</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px' }}>SB</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px' }}>BB</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px' }}>Ante</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {editLevels.map((lv, idx) => (
                <tr key={lv.level} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '4px 4px 4px 0', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{lv.level}</td>
                  {(['smallBlind', 'bigBlind', 'ante'] as const).map((field) => (
                    <td key={field} style={{ padding: '4px 4px' }}>
                      <input
                        type="number" min={0}
                        value={lv[field]}
                        onChange={(e) => setEditLevels((prev) => prev.map((x, i) => i === idx ? { ...x, [field]: parseInt(e.target.value) || 0 } : x))}
                        style={{ width: '100%', background: '#0A1F30', border: '1px solid #1A3550', borderRadius: '4px', padding: '4px 6px', fontSize: '12px', textAlign: 'center', color: 'white', outline: 'none' }}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '4px 0 4px 4px', textAlign: 'center' }}>
                    <button
                      onClick={() => setEditLevels((prev) => prev.filter((_, i) => i !== idx).map((x, i) => ({ ...x, level: i + 1 })))}
                      style={{ color: '#ef4444', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
                      title="Remover nível"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => setEditLevels((prev) => [...prev, { level: prev.length + 1, smallBlind: 0, bigBlind: 0, ante: 0 }])}
            className="text-xs text-sx-cyan hover:text-white"
          >+ Adicionar nível</button>

          {/* Intervalos */}
          <div className="border-t border-white/8 pt-3 space-y-2">
            <div className="text-xs text-white/40 uppercase tracking-widest">Intervalos</div>
            {editBreaks.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="text-xs text-white/40 w-28 shrink-0">Após nível</span>
                <input
                  type="number" min={1}
                  value={b.afterLevel}
                  onChange={(e) => setEditBreaks((prev) => prev.map((x) => x.id === b.id ? { ...x, afterLevel: e.target.value } : x))}
                  className="w-16 bg-sx-input border border-sx-border2 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-sx-cyan"
                />
                <span className="text-xs text-white/40">dur. (min)</span>
                <input
                  type="number" min={1}
                  value={b.durationMinutes}
                  onChange={(e) => setEditBreaks((prev) => prev.map((x) => x.id === b.id ? { ...x, durationMinutes: e.target.value } : x))}
                  className="w-16 bg-sx-input border border-sx-border2 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-sx-cyan"
                />
                <button
                  onClick={() => setEditBreaks((prev) => prev.filter((x) => x.id !== b.id))}
                  className="text-red-500 hover:text-red-300 text-xs"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setEditBreaks((prev) => [...prev, { id: String(Date.now()), afterLevel: '', durationMinutes: '15' }])}
              className="text-xs text-sx-cyan hover:text-white"
            >+ Adicionar intervalo</button>
          </div>

          {/* Salvar / Cancelar */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onSaveBlinds}
              className="flex-1 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-semibold"
            >
              Salvar
            </button>
            <button
              onClick={() => setEditingBlinds(false)}
              className="px-4 py-2 bg-sx-input hover:bg-sx-card2 rounded-lg text-sm text-white/50 border border-sx-border2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Player Row ───────────────────────────────────────────────────────────────

function PlayerRow({ player, tournament, rowIndex, actionLoading, onRebuy, onAddon, onEliminate, onPrize, onCancelRegistration }: {
  player: TournamentPlayer
  tournament: Tournament
  rowIndex: number
  actionLoading: string | null
  onRebuy: () => void
  onAddon: () => void
  onEliminate: () => void
  onPrize: () => void
  onCancelRegistration: () => void
}) {
  const isActive = ['REGISTERED', 'ACTIVE', 'WINNER'].includes(player.status)
  const tournamentRunning = ['RUNNING', 'ON_BREAK'].includes(tournament.status)
  const canRebuy = isActive && tournamentRunning && !!tournament.rebuyAmount &&
    (tournament.lateRegistrationLevel === null || tournament.currentLevel <= tournament.lateRegistrationLevel)

  const parsedBreaksForAddon: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] }
  })()
  const addonLevel = tournament.addonAfterLevel
  const addonNextIsBreak = addonLevel != null && parsedBreaksForAddon.some((b) => b.afterLevel === addonLevel)
  const atAddonLevel = !tournament.isOnBreak && tournament.currentLevel === addonLevel && addonNextIsBreak
  const duringAddonBreak = tournament.isOnBreak && tournament.currentLevel === addonLevel
  // Quando não há break configurado após addonAfterLevel, o addon aparece no nível seguinte
  const atAddonLevelNoBreak = addonLevel != null && !addonNextIsBreak &&
    !tournament.isOnBreak && tournament.currentLevel === addonLevel + 1
  const canAddon = isActive && tournamentRunning && !!tournament.addonAmount && !player.hasAddon &&
    (addonLevel === null || atAddonLevel || duringAddonBreak || atAddonLevelNoBreak)
  const canEliminate = isActive && tournamentRunning && player.status !== 'WINNER'
  // Permite corrigir prêmio manualmente também quando o torneio encerrou sem creditar
  const canPrize = isActive && (tournament.status === 'RUNNING' || (tournament.status === 'FINISHED' && !player.prizeAmount))
  const canCancelRegistration = tournament.status === 'REGISTRATION' && player.status === 'REGISTERED'

  const rowBg = player.status === 'WINNER'
    ? 'bg-yellow-900/20 border-l-2 border-l-yellow-600'
    : rowIndex % 2 === 0 ? 'bg-sx-card' : 'bg-white/[0.03]'

  // Posição do eliminado: gravada no banco
  const posLabel = player.status === 'ELIMINATED' && player.position != null
    ? player.position === 1 ? '🥇 1º'
    : player.position === 2 ? '🥈 2º'
    : player.position === 3 ? '🥉 3º'
    : `${player.position}º`
    : null

  return (
    <div className={`${rowBg} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {player.status === 'WINNER' && <span className="text-yellow-400">🏆</span>}
            {posLabel && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                {posLabel}
              </span>
            )}
            <span className="font-medium text-sm truncate">{player.player.name}</span>
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-white/40">
            {player.rebuysCount > 0 && <span>{player.rebuysCount}× rebuy</span>}
            {player.hasAddon && <span>add-on ✓</span>}
            {Number(player.bountyCollected) > 0 && (
              <span className="text-sx-cyan">bounty {fmt(player.bountyCollected)}</span>
            )}
            {player.status === 'ELIMINATED' && player.eliminatedAtLevel && (
              <span>elim. nível {player.eliminatedAtLevel}</span>
            )}
          </div>
          {['ELIMINATED', 'WINNER'].includes(player.status) && (() => {
            const expected = getExpectedPrize(player.position, tournament)
            if (!expected) return null
            return (
              <div className="mt-1 text-xs font-semibold">
                <span className="text-sx-cyan">Prêmio: {fmt(expected)}</span>
              </div>
            )
          })()}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {canRebuy && (
            <button
              onClick={onRebuy}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-sx-card2 hover:bg-blue-700 rounded text-xs disabled:opacity-50"
            >
              Rebuy
            </button>
          )}
          {canAddon && (
            <button
              onClick={onAddon}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-sx-card2 hover:bg-purple-700 rounded text-xs disabled:opacity-50"
            >
              Add-on
            </button>
          )}
          {canEliminate && (
            <button
              onClick={onEliminate}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-sx-card2 hover:bg-red-700 rounded text-xs disabled:opacity-50"
            >
              Eliminar
            </button>
          )}
          {canCancelRegistration && (
            <button
              onClick={onCancelRegistration}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-sx-card2 hover:bg-red-900 rounded text-xs text-red-400 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── InlineLimitsEditor ───────────────────────────────────────────────────────

function InlineLimitsEditor({ tournament, onSave, actionLoading }: {
  tournament: Tournament
  onSave: (addonAfterLevel: number | null) => void
  actionLoading: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [addonAfter, setAddonAfter] = useState(String(tournament.addonAfterLevel ?? ''))

  React.useEffect(() => {
    if (!editing) setAddonAfter(String(tournament.addonAfterLevel ?? ''))
  }, [tournament.addonAfterLevel, editing])

  const handleSave = async () => {
    await onSave(addonAfter ? parseInt(addonAfter) : null)
    setEditing(false)
  }

  const miniInput = { width: '52px', background: '#0A1F30', border: '1px solid rgba(0,200,224,0.4)', borderRadius: '6px', padding: '3px 6px', fontSize: '13px', textAlign: 'center' as const, color: 'white', outline: 'none' }

  if (editing) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {!!tournament.addonAmount && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-white/40">Addon após nível</span>
            <input
              type="number"
              min={1}
              style={miniInput}
              value={addonAfter}
              onChange={(e) => setAddonAfter(e.target.value)}
              placeholder="—"
              autoFocus
            />
          </div>
        )}
        <button onClick={handleSave} disabled={!!actionLoading} className="text-xs font-bold text-sx-cyan disabled:opacity-50 hover:text-white">✓ salvar</button>
        <button onClick={() => setEditing(false)} className="text-xs text-white/30 hover:text-white">cancelar</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {!!tournament.rebuyAmount && (
        <span className="flex items-center gap-1 text-xs text-white/40">
          Rebuy até{' '}
          <span className="text-white/70 font-medium">
            {tournament.lateRegistrationLevel ?? '∞'}
          </span>
        </span>
      )}
      {!!tournament.addonAmount && (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-xs text-white/40 hover:text-sx-cyan transition-colors group"
          title="Clique para editar"
        >
          Addon após{' '}
          <span className="text-white/70 font-medium group-hover:text-sx-cyan">
            {tournament.addonAfterLevel ?? '—'}
          </span>
          <span className="text-white/20 group-hover:text-sx-cyan ml-0.5">✎</span>
        </button>
      )}
      {!tournament.rebuyAmount && !tournament.addonAmount && (
        <span className="text-xs text-white/20">Sem rebuy/addon configurado</span>
      )}
    </div>
  )
}

// ─── BuyInSelector ────────────────────────────────────────────────────────────

function BuyInSelector({ baseAmount, taxAmount, taxChips, startingChips, doubleBonusChips, selected, onChange }: {
  baseAmount: number
  taxAmount: number
  taxChips: number
  startingChips: number
  doubleBonusChips: number
  selected: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'
  onChange: (t: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE') => void
}) {
  // taxa opcional pode existir sem fichas extras (rake adicional sem bônus de chips)
  const hasTax = taxAmount > 0
  const hasDouble = doubleBonusChips > 0

  const options: { key: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'; label: string; amount: number; chips: number; color: string; glow: string }[] = [
    { key: 'NORMAL', label: 'Simples', amount: baseAmount, chips: startingChips, color: 'linear-gradient(135deg, #00C8E0 0%, #007A95 100%)', glow: '0 4px 16px rgba(0,200,224,0.3)' },
    ...(hasTax ? [{ key: 'NORMAL_WITH_TAX' as const, label: 'Simples + Opcional', amount: baseAmount + taxAmount, chips: startingChips + taxChips, color: 'linear-gradient(135deg, #00E0A0 0%, #00957A 100%)', glow: '0 4px 16px rgba(0,224,160,0.3)' }] : []),
    ...(hasDouble ? [{ key: 'DOUBLE' as const, label: 'Duplo', amount: baseAmount * 2 + taxAmount * 2, chips: (startingChips + taxChips) * 2 + doubleBonusChips, color: 'linear-gradient(135deg, #FFB800 0%, #CC7000 100%)', glow: '0 4px 16px rgba(255,184,0,0.3)' }] : []),
  ]

  return (
    <div className="space-y-2">
      <p className="text-xs text-sx-muted uppercase tracking-wider">Tipo de Buy-in</p>
      {options.map((opt) => {
        const isSelected = selected === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
            style={{
              background: isSelected ? opt.color : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: isSelected ? opt.glow : 'none',
            }}
          >
            <div>
              <p className="text-sm font-bold" style={{ color: isSelected ? '#050D15' : 'rgba(255,255,255,0.7)' }}>{opt.label}</p>
              <p className="text-xs mt-0.5" style={{ color: isSelected ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                {opt.chips.toLocaleString('pt-BR')} fichas
              </p>
            </div>
            <span className="text-base font-black" style={{ color: isSelected ? '#050D15' : 'white' }}>
              {fmt(opt.amount)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── ActionModal (rebuy / addon) — suporta Simples, Simples+Opcional, Duplo ──

function ActionModal({ title, baseLabel, baseAmount, taxAmount, baseChips, taxChips, hasDouble, actionLoading, onClose, onConfirm }: {
  title: string
  baseLabel: string
  baseAmount: number
  taxAmount: number
  baseChips: number
  taxChips: number
  hasDouble?: boolean
  actionLoading: string | null
  onClose: () => void
  onConfirm: (type: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE') => void
}) {
  // taxa opcional pode existir sem fichas extras
  const hasTax = taxAmount > 0
  type ActionType = 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'
  const [selected, setSelected] = useState<ActionType>('NORMAL')

  const options: { key: ActionType; label: string; amount: number; chips: number; color: string; glow: string }[] = [
    { key: 'NORMAL', label: baseLabel, amount: baseAmount, chips: baseChips, color: 'linear-gradient(135deg, #00C8E0 0%, #007A95 100%)', glow: '0 4px 16px rgba(0,200,224,0.3)' },
    ...(hasTax ? [{ key: 'NORMAL_WITH_TAX' as const, label: `${baseLabel} + Opcional`, amount: baseAmount + taxAmount, chips: baseChips + taxChips, color: 'linear-gradient(135deg, #00E0A0 0%, #00957A 100%)', glow: '0 4px 16px rgba(0,224,160,0.3)' }] : []),
    ...(hasDouble ? [{ key: 'DOUBLE' as const, label: 'Duplo', amount: (baseAmount + taxAmount) * 2, chips: (baseChips + taxChips) * 2, color: 'linear-gradient(135deg, #FFB800 0%, #CC7000 100%)', glow: '0 4px 16px rgba(255,184,0,0.3)' }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-2xl p-5 space-y-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.18)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>

        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = selected === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelected(opt.key)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
                style={{
                  background: isSelected ? opt.color : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: isSelected ? opt.glow : 'none',
                }}
              >
                <div>
                  <p className="text-sm font-bold" style={{ color: isSelected ? '#050D15' : 'rgba(255,255,255,0.7)' }}>{opt.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: isSelected ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                    {opt.chips.toLocaleString('pt-BR')} fichas
                  </p>
                </div>
                <span className="text-base font-black" style={{ color: isSelected ? '#050D15' : 'white' }}>
                  {fmt(opt.amount)}
                </span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => onConfirm(selected)}
          disabled={!!actionLoading}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 btn-sx-primary"
        >
          Confirmar
        </button>
      </div>
    </div>
  )
}

// ─── Payout Modal ─────────────────────────────────────────────────────────────

const STANDARD_PAYOUTS: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [40, 30, 20, 10],
  5: [35, 25, 20, 12, 8],
  6: [30, 22, 17, 13, 10, 8],
  7: [27, 20, 15, 13, 10, 9, 6],
  8: [25, 18, 14, 12, 10, 8, 7, 6],
  9: [24, 17, 13, 11, 9, 8, 7, 6, 5],
  10: [22, 16, 12, 10, 9, 8, 7, 6, 5, 5],
}

function getSuggestedPayouts(n: number): number[] {
  if (STANDARD_PAYOUTS[n]) return STANDARD_PAYOUTS[n]
  // Para n > 10: distribui de forma decrescente
  const base = Math.floor(100 / n)
  const arr = Array(n).fill(base)
  let remainder = 100 - base * n
  for (let i = 0; i < remainder; i++) arr[i]++
  return arr
}

function PayoutModal({ payout, players, tournamentId, actionLoading, onClose, onPay, onFinishByDeal, onSetDealPayouts, onSetPayoutStructure }: {
  payout: PayoutSuggestion
  players: TournamentPlayer[]
  tournamentId: string
  actionLoading: string | null
  onClose: () => void
  onPay: (playerId: string, amount: number) => Promise<void>
  onFinishByDeal: () => Promise<void>
  onSetDealPayouts: (payouts: { position: number; amount: number }[]) => Promise<void>
  onSetPayoutStructure: (structure: { position: number; percent: number }[]) => Promise<void>
}) {
  const prizePool = Number(payout.prizePool)
  const paid = new Set(players.filter((p) => p.prizeAmount).map((p) => p.id))
  const eligible = players.filter((p) => p.status !== 'ELIMINATED' && !paid.has(p.id))

  type DealType = 'full' | 'positions' | 'partial'
  // step: 'overview' = posições + estrutura sugerida, 'structure' = editar %s, 'deal' = acordo
  const [step, setStep] = useState<'overview' | 'structure' | 'deal'>('overview')
  const [numPositions, setNumPositions] = useState(Math.min(3, eligible.length || 1))
  const [percents, setPercents] = useState<number[]>([])
  const [dealType, setDealType] = useState<DealType | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const alreadyPaid = players.reduce((s, p) => s + Number(p.prizeAmount ?? 0), 0)
  const remainingPot = Math.max(0, prizePool - alreadyPaid)
  const activeDealPlayers = players.filter((p) => ['REGISTERED', 'ACTIVE'].includes(p.status))
  const n = activeDealPlayers.length || 1

  const [dealMode, setDealMode] = useState<'pct' | 'fixed'>('fixed')
  const [dealValues, setDealValues] = useState<Record<string, string>>({})
  const [saveValues, setSaveValues] = useState<Record<string, string>>({})
  const [positionAmounts, setPositionAmounts] = useState<{ position: number; amount: number; locked: boolean }[]>([])

  const initEqualValues = (pot: number, mode: 'pct' | 'fixed') => {
    const init: Record<string, string> = {}
    activeDealPlayers.forEach((p) => {
      init[p.id] = mode === 'pct' ? (100 / n).toFixed(1) : (pot / n).toFixed(2)
    })
    return init
  }

  const handleConfirmPositions = () => {
    setPercents(getSuggestedPayouts(numPositions))
    setStep('structure')
  }

  const handleSelectDeal = (type: DealType) => {
    setDealType(type)
    if (type === 'full') {
      setDealValues(initEqualValues(remainingPot, 'fixed'))
      setDealMode('fixed')
    } else if (type === 'partial') {
      setSaveValues(initEqualValues(remainingPot / 2, 'fixed'))
    } else if (type === 'positions') {
      // Todos os jogadores ativos participam do acordo — nenhum travado
      const pcts = getSuggestedPayouts(n)
      const amounts: { position: number; amount: number; locked: boolean }[] = Array.from(
        { length: n }, (_, i) => ({
          position: i + 1,
          amount: Math.round(remainingPot * (pcts[i] ?? 0) / 100 * 100) / 100,
          locked: false,
        })
      )
      // Ajusta o 1º lugar para absorver diferença de arredondamento
      const total = amounts.reduce((s, a) => s + a.amount, 0)
      if (amounts.length > 0) amounts[0].amount = Math.round((amounts[0].amount + remainingPot - total) * 100) / 100
      setPositionAmounts(amounts)
    }
    setStep('deal')
  }

  // Tipo 1
  const dealTotal = activeDealPlayers.reduce((s, p) => {
    const v = parseFloat(dealValues[p.id] || '0') || 0
    return s + (dealMode === 'pct' ? (remainingPot * v) / 100 : v)
  }, 0)
  const dealBalanced = Math.abs(dealTotal - remainingPot) < 0.02

  // Tipo 2 — todos editáveis, total deve fechar com remainingPot
  const editableTotal = positionAmounts.reduce((s, a) => s + a.amount, 0)
  const positionsValid = positionAmounts.length > 0
    && positionAmounts.every((a) => a.amount >= 0)
    && Math.abs(editableTotal - remainingPot) < 0.02

  // Tipo 3
  const saveTotal = activeDealPlayers.reduce((s, p) => s + (parseFloat(saveValues[p.id] || '0') || 0), 0)
  const remainingAfterSave = remainingPot - saveTotal
  const saveValid = saveTotal > 0 && remainingAfterSave >= 0.01

  const handleConfirmDeal = async () => {
    if (dealType === 'full') {
      for (const p of activeDealPlayers) {
        const v = parseFloat(dealValues[p.id] || '0') || 0
        const amount = dealMode === 'pct' ? (remainingPot * v) / 100 : v
        if (amount > 0) await onPay(p.id, Math.round(amount * 100) / 100)
      }
      await onFinishByDeal()
    } else if (dealType === 'positions') {
      await onSetDealPayouts(positionAmounts.map(({ position, amount }) => ({ position, amount })))
    } else if (dealType === 'partial') {
      for (const p of activeDealPlayers) {
        const amount = parseFloat(saveValues[p.id] || '0') || 0
        if (amount > 0) await onPay(p.id, Math.round(amount * 100) / 100)
      }
    }
    setSuccess(
      dealType === 'partial'
        ? `Saves registrados! R$ ${remainingAfterSave.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} continuam em jogo.`
        : dealType === 'positions'
        ? 'Acordo salvo! Prêmios aplicados automaticamente conforme as posições forem determinadas.'
        : 'Acordo registrado!'
    )
    setTimeout(() => { setSuccess(null); onClose() }, 3000)
  }

  const totalPercent = percents.reduce((a, b) => a + b, 0)
  const medal = (pos: number) => pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `${pos}º`

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" style={{ backdropFilter: 'blur(4px)' }}>
      <div className="bg-sx-card rounded-2xl w-full max-w-md p-4 space-y-4 max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step !== 'overview' && (
              <button
                onClick={() => { setStep('overview'); setDealType(null) }}
                className="text-white/40 hover:text-white text-lg"
              >←</button>
            )}
            <h3 className="font-semibold">
              {step === 'deal' ? '🤝 Acordo' : 'Distribuição de Prêmios'}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/40">✕</button>
        </div>

        <div className="text-center">
          <div className="text-xs text-white/40">Prize Pool Total</div>
          <div className="text-2xl font-bold text-green-400">{fmt(payout.prizePool)}</div>
        </div>

        {success && (
          <div className="bg-sx-cyan-deep/40 border border-sx-cyan-dim rounded-lg px-3 py-2 text-sm text-sx-cyan text-center">
            {success}
          </div>
        )}

        {/* ── Step overview: posições + acordo ── */}
        {step === 'overview' && (
          <div className="space-y-4">
            {/* Seletor de quantidade de posições */}
            <div>
              <label className="text-xs text-white/50 uppercase tracking-widest font-medium">Quantas posições serão premiadas?</label>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => setNumPositions((prev) => Math.max(1, prev - 1))}
                  className="w-10 h-10 rounded-xl text-xl font-bold flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >−</button>
                <div className="flex-1 text-center text-3xl font-bold text-white">{numPositions}</div>
                <button
                  onClick={() => setNumPositions((prev) => Math.min(eligible.length || 10, prev + 1))}
                  className="w-10 h-10 rounded-xl text-xl font-bold flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >+</button>
              </div>
            </div>
            <button
              onClick={handleConfirmPositions}
              className="w-full py-3 rounded-xl font-semibold text-sm btn-sx-primary"
            >
              Ver estrutura sugerida →
            </button>

            {/* Botões de acordo */}
            {activeDealPlayers.length >= 2 && remainingPot > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
                <div className="text-xs text-white/30 text-center mb-3">
                  🤝 Acordo — R$ {remainingPot.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em jogo
                  {alreadyPaid > 0 && ` · R$ ${alreadyPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} já pagos`}
                </div>
                <div className="space-y-2">
                  {([
                    { type: 'full' as const, label: '💰 Dividir tudo e encerrar', desc: 'Cada jogador recebe sua parte agora. Jogo encerra.' },
                    { type: 'positions' as const, label: '🏆 Redistribuir premiação nas posições', desc: 'Redistribuição do prêmio restante entre as posições. Torneio continua.' },
                    { type: 'partial' as const, label: '🛡️ Salvar parte e continuar', desc: 'Cada um garante uma parte agora. O resto ainda é disputado.' },
                  ]).map(({ type, label, desc }) => (
                    <button key={type} onClick={() => handleSelectDeal(type)}
                      className="w-full text-left px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}
                    >
                      <div className="text-sm font-semibold text-yellow-400">{label}</div>
                      <div className="text-xs text-white/30 mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step structure: editar percentuais ── */}
        {step === 'structure' && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">Ajuste os percentuais. Total deve ser 100%.</p>
            <div className="space-y-2">
              {percents.map((pct, i) => {
                const amount = (prizePool * pct) / 100
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="text-sm w-6 text-white/50">{medal(i + 1)}</span>
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="number" min={1} max={100} value={pct}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                          setPercents((arr) => arr.map((x, j) => j === i ? v : x))
                        }}
                        className="w-16 bg-sx-input border border-sx-border2 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-sx-cyan"
                      />
                      <span className="text-white/40 text-sm">%</span>
                    </div>
                    <span className="text-sm font-semibold text-sx-cyan">{fmt(amount)}</span>
                  </div>
                )
              })}
            </div>
            <div className={`flex justify-between text-sm font-medium px-1 ${totalPercent === 100 ? 'text-sx-cyan' : 'text-red-400'}`}>
              <span>Total</span>
              <span>{totalPercent}%{totalPercent !== 100 ? ` (falta ${100 - totalPercent}%)` : ' ✓'}</span>
            </div>
            <button
              onClick={async () => {
                const structure = percents.map((pct, i) => ({ position: i + 1, percent: pct }))
                await onSetPayoutStructure(structure)
                onClose()
              }}
              disabled={totalPercent !== 100 || !!actionLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm btn-sx-primary disabled:opacity-40"
            >
              {actionLoading === 'set-payout-structure' ? 'Salvando...' : '✓ Salvar e exibir no clock'}
            </button>
          </div>
        )}

        {/* ── Resumo do pot quando em modo deal ── */}
        {step === 'deal' && (
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
            <div className="text-xs text-yellow-600 uppercase tracking-widest mb-1">
              {dealType === 'full' ? 'Dividir e encerrar' : dealType === 'positions' ? 'Redistribuir posições' : 'Salvar parte · continuar'}
            </div>
            <div className="text-2xl font-bold text-yellow-400">
              R$ {remainingPot.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            {alreadyPaid > 0 && (
              <div className="text-xs text-white/30 mt-1">
                R$ {alreadyPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} já pagos a eliminados
              </div>
            )}
          </div>
        )}

        {/* ── Tipo 1: dividir tudo ── */}
        {step === 'deal' && dealType === 'full' && (<>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            {(['fixed', 'pct'] as const).map((mode) => (
              <button key={mode} onClick={() => {
                const init: Record<string, string> = {}
                activeDealPlayers.forEach((p) => {
                  const cur = parseFloat(dealValues[p.id] || '0') || 0
                  init[p.id] = mode === 'pct' && dealMode === 'fixed'
                    ? (remainingPot > 0 ? (cur / remainingPot * 100).toFixed(1) : (100 / n).toFixed(1))
                    : mode === 'fixed' && dealMode === 'pct'
                    ? ((remainingPot * cur) / 100).toFixed(2)
                    : dealValues[p.id]
                })
                setDealValues(init); setDealMode(mode)
              }}
                className="flex-1 py-2 text-sm font-semibold"
                style={{ background: dealMode === mode ? 'rgba(0,200,224,0.2)' : 'transparent', color: dealMode === mode ? '#00C8E0' : 'rgba(255,255,255,0.4)' }}
              >{mode === 'fixed' ? 'R$ fixo' : 'Porcentagem %'}</button>
            ))}
          </div>
          <div className="space-y-2">
            {activeDealPlayers.map((p) => {
              const v = parseFloat(dealValues[p.id] || '0') || 0
              const amount = dealMode === 'pct' ? (remainingPot * v) / 100 : v
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.player.name}</div>
                    {dealMode === 'pct' && <div className="text-xs text-white/30">= R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-white/40 text-sm">{dealMode === 'pct' ? '%' : 'R$'}</span>
                    <input type="number" min={0} step={dealMode === 'pct' ? 0.1 : 0.01}
                      value={dealValues[p.id] ?? ''}
                      onChange={(e) => setDealValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-24 bg-sx-input border border-sx-border2 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-sx-cyan"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className={`flex justify-between text-sm font-semibold px-1 ${dealBalanced ? 'text-sx-cyan' : 'text-red-400'}`}>
            <span>Total</span>
            <span>R$ {dealTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {!dealBalanced && <span className="text-xs font-normal ml-1">({dealTotal > remainingPot ? '+' : '−'}R$ {Math.abs(dealTotal - remainingPot).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>}
              {dealBalanced && ' ✓'}
            </span>
          </div>
          <button disabled={!dealBalanced || !!actionLoading} onClick={handleConfirmDeal}
            className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
            style={{ background: dealBalanced ? '#EAB308' : 'rgba(234,179,8,0.3)', color: '#000' }}
          >{actionLoading ? 'Registrando...' : '✓ Dividir e encerrar'}</button>
        </>)}

        {/* ── Tipo 2: redistribuir por posição ── */}
        {step === 'deal' && dealType === 'positions' && (<>
          <p className="text-xs text-white/40">
            Distribua o prize pool entre todos os jogadores ativos. O total deve fechar com o valor do pot.
          </p>
          <div className="space-y-2">
            {positionAmounts.map((entry, idx) => {
              const medalIcon = entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : `${entry.position}º`
              const pct = remainingPot > 0 ? (entry.amount / remainingPot * 100).toFixed(1) : '0.0'
              return (
                <div key={entry.position} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="w-8 text-center text-base">{medalIcon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{entry.position}º lugar</div>
                    <div className="text-xs text-white/30">{pct}% do pot</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-white/40 text-sm">R$</span>
                    <input
                      type="number" min={0} step={0.01}
                      value={entry.amount}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0
                        setPositionAmounts((prev) => prev.map((x, j) => j === idx ? { ...x, amount: Math.round(v * 100) / 100 } : x))
                      }}
                      className="w-28 bg-sx-input border border-sx-border2 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-sx-cyan"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className={`flex justify-between text-sm font-semibold px-1 ${positionsValid ? 'text-sx-cyan' : 'text-red-400'}`}>
            <span>Total distribuído</span>
            <span>
              R$ {editableTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {' / '}
              R$ {remainingPot.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {positionsValid && ' ✓'}
              {!positionsValid && (
                <span className="text-xs font-normal ml-1">
                  ({editableTotal > remainingPot ? '+' : '−'}R$ {Math.abs(editableTotal - remainingPot).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                </span>
              )}
            </span>
          </div>
          <button disabled={!positionsValid || !!actionLoading} onClick={handleConfirmDeal}
            className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
            style={{ background: positionsValid ? '#EAB308' : 'rgba(234,179,8,0.3)', color: '#000' }}
          >{actionLoading ? 'Salvando...' : '✓ Salvar acordo e continuar jogando'}</button>
        </>)}

        {/* ── Tipo 3: save parcial ── */}
        {step === 'deal' && dealType === 'partial' && (<>
          <p className="text-xs text-white/40">Defina quanto cada jogador garante agora. O restante continua sendo disputado normalmente.</p>
          <div className="space-y-2">
            {activeDealPlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex-1 min-w-0 text-sm font-medium truncate">{p.player.name}</div>
                <div className="flex items-center gap-1">
                  <span className="text-white/40 text-sm">R$</span>
                  <input type="number" min={0} step={0.01}
                    value={saveValues[p.id] ?? ''}
                    onChange={(e) => setSaveValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="w-24 bg-sx-input border border-sx-border2 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-sx-cyan"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Saves totais</span>
              <span className={saveTotal > remainingPot ? 'text-red-400' : 'text-white'}>R$ {saveTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-white/50">Continua em jogo</span>
              <span className={remainingAfterSave < 0 ? 'text-red-400' : 'text-yellow-400'}>
                R$ {Math.max(0, remainingAfterSave).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          {saveTotal > remainingPot && <p className="text-xs text-red-400 px-1">Saves ultrapassam o pot disponível.</p>}
          <button disabled={!saveValid || !!actionLoading} onClick={handleConfirmDeal}
            className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
            style={{ background: saveValid ? '#EAB308' : 'rgba(234,179,8,0.3)', color: '#000' }}
          >{actionLoading ? 'Registrando...' : '✓ Registrar saves e continuar'}</button>
        </>)}

      </div>
    </div>
  )
}
