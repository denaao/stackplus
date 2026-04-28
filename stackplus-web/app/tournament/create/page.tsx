'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import { useAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'

interface BlindLevel {
  level: number
  smallBlind: number
  bigBlind: number
  ante: number
}

interface BlindTemplate {
  name: string
  levels: BlindLevel[]
}

interface BreakConfig {
  id: string
  afterLevel: string
  durationMinutes: string
}

const EMPTY_LEVEL: BlindLevel = { level: 1, smallBlind: 25, bigBlind: 50, ante: 0 }
const LS_KEY = 'stackplus-tournament-presets'

interface Preset {
  id: string
  presetName: string
  form: Record<string, string>
  customLevels: BlindLevel[]
  breaks: BreakConfig[]
}

function loadPresets(): Preset[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}
function savePresets(presets: Preset[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(presets))
}

export default function CreateTournamentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sx-bg" />}>
      <CreateTournamentContent />
    </Suspense>
  )
}

function CreateTournamentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const homeGameId = searchParams.get('homeGameId') ?? ''
  const eventId = searchParams.get('eventId') ?? ''
  const { user, logout } = useAuthStore()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<BlindTemplate[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [breaks, setBreaks] = useState<BreakConfig[]>([{ id: '1', afterLevel: '', durationMinutes: '15' }])

  const [staffRetentionDest, setStaffRetentionDest] = useState<'STAFF' | 'ADM'>('STAFF')

  const [form, setForm] = useState({
    name: '',
    staffRetentionPct: '',
    rankingRetentionPct: '',
    timeChipBonus: '',
    timeChipUntilLevel: '',
    buyInAmount: '',
    rebuyAmount: '',
    addonAmount: '',
    bountyAmount: '',
    rake: '0',
    startingChips: '5000',
    rebuyChips: '',
    addonChips: '',
    buyInTaxAmount: '',
    buyInTaxChips: '',
    rebuyTaxAmount: '',
    rebuyTaxChips: '',
    addonTaxAmount: '',
    addonTaxChips: '',
    lateRegistrationLevel: '',
    rebuyUntilLevel: '',
    addonAfterLevel: '',
    minutesPerLevelPreLateReg: '15',
    minutesPerLevelPostLateReg: '',
    blindTemplateName: '',
  })
  const [customLevels, setCustomLevels] = useState<BlindLevel[]>([])
  const [useCustom, setUseCustom] = useState(false)
  const [doubleBuyInEnabled, setDoubleBuyInEnabled] = useState(false)
  const [doubleBuyInBonusChips, setDoubleBuyInBonusChips] = useState('')
  const [doubleRebuyEnabled, setDoubleRebuyEnabled] = useState(false)
  const [doubleRebuyBonusChips, setDoubleRebuyBonusChips] = useState('')

  useEffect(() => {
    api.get('/tournaments/blind-templates').then((r) => setTemplates(r.data)).catch(() => {})
    setPresets(loadPresets())
  }, [])

  const handleSavePreset = () => {
    const name = prompt('Nome do modelo:')
    if (!name?.trim()) return
    const preset: Preset = {
      id: Date.now().toString(),
      presetName: name.trim(),
      form,
      customLevels,
      breaks,
    }
    const updated = [preset, ...presets]
    savePresets(updated)
    setPresets(updated)
  }

  const handleLoadPreset = (preset: Preset) => {
    setForm(preset.form as typeof form)
    setCustomLevels(preset.customLevels)
    setUseCustom(preset.customLevels.length > 0)
    if (preset.breaks?.length) setBreaks(preset.breaks)
  }

  const handleDeletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id)
    savePresets(updated)
    setPresets(updated)
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleTemplateSelect = (name: string) => {
    set('blindTemplateName', name)
    if (name) {
      const t = templates.find((t) => t.name === name)
      if (t) setCustomLevels(t.levels.map((l) => ({ ...l })))
      setUseCustom(false)
    }
  }

  const addLevel = () => {
    const last = customLevels[customLevels.length - 1]
    const next: BlindLevel = last
      ? { level: last.level + 1, smallBlind: last.bigBlind, bigBlind: last.bigBlind * 2, ante: last.ante }
      : { ...EMPTY_LEVEL }
    setCustomLevels((ls) => [...ls, next])
    setUseCustom(true)
    set('blindTemplateName', '')
  }

  const removeLevel = (i: number) => {
    setCustomLevels((ls) => {
      const removed = ls[i]
      const filtered = ls.filter((_, idx) => idx !== i)
      // Renumera todos os níveis sequencialmente
      const renumbered = filtered.map((l, idx) => ({ ...l, level: idx + 1 }))
      // Ajusta breaks: remove o break do nível deletado, decrementa os posteriores
      setBreaks((bs) => bs
        .filter((b) => parseInt(b.afterLevel) !== removed.level)
        .map((b) => parseInt(b.afterLevel) > removed.level
          ? { ...b, afterLevel: String(parseInt(b.afterLevel) - 1) }
          : b
        )
      )
      return renumbered
    })
    setUseCustom(true)
    set('blindTemplateName', '')
  }

  const insertLevelAfter = (i: number) => {
    setCustomLevels((ls) => {
      const cur = ls[i]
      const next = ls[i + 1]
      const newLevel: BlindLevel = next
        ? {
            level: cur.level + 1,
            smallBlind: Math.round((cur.smallBlind + next.smallBlind) / 2),
            bigBlind: Math.round((cur.bigBlind + next.bigBlind) / 2),
            ante: Math.round((cur.ante + next.ante) / 2),
          }
        : { level: cur.level + 1, smallBlind: cur.bigBlind, bigBlind: cur.bigBlind * 2, ante: cur.ante }
      const inserted = [...ls.slice(0, i + 1), newLevel, ...ls.slice(i + 1)]
      const renumbered = inserted.map((l, idx) => ({ ...l, level: idx + 1 }))
      setBreaks((bs) => bs.map((b) => parseInt(b.afterLevel) > cur.level
        ? { ...b, afterLevel: String(parseInt(b.afterLevel) + 1) }
        : b
      ))
      return renumbered
    })
    setUseCustom(true)
    set('blindTemplateName', '')
  }

  const updateLevel = (i: number, field: keyof BlindLevel, val: string) => {
    setCustomLevels((ls) => ls.map((l, idx) => idx === i ? { ...l, [field]: parseInt(val) || 0 } : l))
    setUseCustom(true)
    set('blindTemplateName', '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        buyInAmount: parseFloat(form.buyInAmount),
        rake: parseFloat(form.rake) || 0,
        startingChips: parseInt(form.startingChips),
        minutesPerLevelPreLateReg: parseInt(form.minutesPerLevelPreLateReg),
      }
      if (form.minutesPerLevelPostLateReg) payload.minutesPerLevelPostLateReg = parseInt(form.minutesPerLevelPostLateReg)
      const validBreaks = breaks.filter((b) => b.afterLevel && b.durationMinutes)
      if (validBreaks.length > 0) payload.breaks = validBreaks.map((b) => ({ afterLevel: parseInt(b.afterLevel), durationMinutes: parseInt(b.durationMinutes) }))
      if (form.rebuyAmount) payload.rebuyAmount = parseFloat(form.rebuyAmount)
      if (form.addonAmount) payload.addonAmount = parseFloat(form.addonAmount)
      if (form.bountyAmount) payload.bountyAmount = parseFloat(form.bountyAmount)
      if (form.rebuyChips) payload.rebuyChips = parseInt(form.rebuyChips)
      if (form.addonChips) payload.addonChips = parseInt(form.addonChips)
      if (form.buyInTaxAmount) payload.buyInTaxAmount = parseFloat(form.buyInTaxAmount)
      if (form.buyInTaxChips) payload.buyInTaxChips = parseInt(form.buyInTaxChips)
      if (form.rebuyTaxAmount) payload.rebuyTaxAmount = parseFloat(form.rebuyTaxAmount)
      if (form.rebuyTaxChips) payload.rebuyTaxChips = parseInt(form.rebuyTaxChips)
      if (form.addonTaxAmount) payload.addonTaxAmount = parseFloat(form.addonTaxAmount)
      if (form.addonTaxChips) payload.addonTaxChips = parseInt(form.addonTaxChips)
      if (form.lateRegistrationLevel) payload.lateRegistrationLevel = parseInt(form.lateRegistrationLevel)
      if (form.rebuyUntilLevel) payload.rebuyUntilLevel = parseInt(form.rebuyUntilLevel)
      if (form.addonAfterLevel) payload.addonAfterLevel = parseInt(form.addonAfterLevel)
      if (doubleBuyInEnabled && doubleBuyInBonusChips) payload.doubleBuyInBonusChips = parseInt(doubleBuyInBonusChips)
      if (doubleRebuyEnabled) payload.doubleRebuyEnabled = true
      if (doubleRebuyEnabled && doubleRebuyBonusChips) payload.doubleRebuyBonusChips = parseInt(doubleRebuyBonusChips)
      if (form.staffRetentionPct) {
        payload.staffRetentionPct = parseFloat(form.staffRetentionPct)
        payload.staffRetentionDest = staffRetentionDest
      }
      if (form.rankingRetentionPct) payload.rankingRetentionPct = parseFloat(form.rankingRetentionPct)
      if (form.timeChipBonus) payload.timeChipBonus = parseInt(form.timeChipBonus)
      if (form.timeChipUntilLevel) payload.timeChipUntilLevel = parseInt(form.timeChipUntilLevel)

      if (useCustom && customLevels.length > 0) {
        payload.blindLevels = customLevels
      } else if (form.blindTemplateName) {
        payload.blindTemplateName = form.blindTemplateName
      }

      const endpoint = eventId
        ? `/events/${eventId}/tournaments`
        : '/tournaments'
      if (!eventId && homeGameId) payload.homeGameId = homeGameId
      const res = await api.post(endpoint, payload)
      router.push(`/tournament/${res.data.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao criar torneio'))
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-cyan'
  const label = 'block text-xs text-sx-muted mb-1'

  return (
    <div className="min-h-screen">
      <AppHeader
        title="Criar Torneio"
        onBack={() => eventId ? router.push(`/event/${eventId}`) : homeGameId ? router.push(`/homegame/${homeGameId}/tournaments`) : router.back()}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />
      <div className="max-w-2xl mx-auto p-4 pt-6">

      {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}

      {/* Modelos salvos */}
      {presets.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-sx-muted uppercase tracking-wider mb-2">Modelos salvos</h2>
          <div className="flex flex-col gap-2">
            {presets.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-sx-card border border-sx-border rounded-lg px-3 py-2">
                <span className="text-sm text-white">{p.presetName}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadPreset(p)}
                    className="text-xs text-sx-cyan hover:text-white px-2 py-1 rounded hover:bg-sx-input"
                  >
                    Carregar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(p.id)}
                    className="text-xs text-white/40 hover:text-red-400 px-2 py-1 rounded hover:bg-sx-input"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Básico */}
        <section className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
          <h2 className="text-[11px] font-black uppercase tracking-widest text-sx-cyan">Informações Básicas</h2>
          <div>
            <label className={label}>Nome do torneio *</label>
            <input className={input} value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Ex: Torneio Semanal" />
          </div>

          {/* Rake + Retenções */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Rake (%)</label>
              <input className={input} type="number" step="0.1" value={form.rake} onChange={(e) => set('rake', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={label}>Retenção Staff (%)</label>
              <input
                className={input}
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.staffRetentionPct ?? ''}
                onChange={(e) => set('staffRetentionPct', e.target.value)}
                placeholder="0"
              />
              {form.staffRetentionPct && parseFloat(form.staffRetentionPct) > 0 && (
                <div className="flex gap-1 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setStaffRetentionDest('STAFF')}
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      staffRetentionDest === 'STAFF'
                        ? 'bg-sx-cyan/20 border-sx-cyan text-sx-cyan'
                        : 'bg-sx-input border-sx-border2 text-white/50 hover:text-white'
                    }`}
                  >
                    Staff
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffRetentionDest('ADM')}
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      staffRetentionDest === 'ADM'
                        ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                        : 'bg-sx-input border-sx-border2 text-white/50 hover:text-white'
                    }`}
                  >
                    Adm
                  </button>
                </div>
              )}
              <p className="text-[11px] text-white/30 mt-1">
                {form.staffRetentionPct && parseFloat(form.staffRetentionPct) > 0
                  ? staffRetentionDest === 'STAFF'
                    ? 'Vai para a caixinha do torneio'
                    : 'Entra como lucro no fechamento'
                  : 'Retido da premiação para staff'}
              </p>
            </div>
            <div>
              <label className={label}>Retenção Ranking (%)</label>
              <input
                className={input}
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.rankingRetentionPct ?? ''}
                onChange={(e) => set('rankingRetentionPct', e.target.value)}
                placeholder="0"
              />
              <p className="text-[11px] text-white/30 mt-1">Retido da premiação para ranking</p>
            </div>
          </div>

          {/* Time Chip */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Time Chip (fichas)</label>
              <input
                className={input}
                type="number"
                value={form.timeChipBonus ?? ''}
                onChange={(e) => set('timeChipBonus', e.target.value)}
                placeholder="Opcional"
              />
              <p className="text-[11px] text-white/30 mt-1">Fichas bônus para quem chegar no horário</p>
            </div>
            <div>
              <label className={label}>Habilitado até o nível</label>
              <input
                className={input}
                type="number"
                value={form.timeChipUntilLevel ?? ''}
                onChange={(e) => set('timeChipUntilLevel', e.target.value)}
                placeholder="Opcional"
              />
              <p className="text-[11px] text-white/30 mt-1">Nível limite para receber o bônus</p>
            </div>
          </div>

          {/* Buy-in */}
          <div>
            <p className="text-xs font-medium text-sx-muted mb-2">Buy-in</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={label}>Valor (R$) *</label>
                <input className={input} type="number" step="0.01" value={form.buyInAmount} onChange={(e) => set('buyInAmount', e.target.value)} required placeholder="0.00" />
              </div>
              <div>
                <label className={label}>Fichas *</label>
                <input className={input} type="number" value={form.startingChips} onChange={(e) => set('startingChips', e.target.value)} required />
              </div>
              <div>
                <label className={label}>Duplo</label>
                <button
                  type="button"
                  onClick={() => { setDoubleBuyInEnabled((v) => !v); setDoubleBuyInBonusChips('') }}
                  style={{ background: doubleBuyInEnabled ? '#00C8E0' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
                  className="relative inline-flex h-[42px] w-full items-center rounded-xl transition-all duration-200 px-3 gap-2"
                >
                  <span className={`inline-block h-5 w-5 shrink-0 rounded-full bg-white shadow-md transition-transform duration-200 ${doubleBuyInEnabled ? 'translate-x-1' : ''}`} />
                  <span className="text-xs font-medium" style={{ color: doubleBuyInEnabled ? '#0a1628' : 'rgba(255,255,255,0.5)' }}>{doubleBuyInEnabled ? 'Habilitado' : 'Desabilitado'}</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div>
                <label className={label}>Taxa (R$)</label>
                <input className={input} type="number" step="0.01" value={form.buyInTaxAmount} onChange={(e) => set('buyInTaxAmount', e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <label className={label}>Fichas da taxa</label>
                <input className={input} type="number" value={form.buyInTaxChips} onChange={(e) => set('buyInTaxChips', e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                {doubleBuyInEnabled && (
                  <>
                    <label className={label}>Fichas bônus</label>
                    <input className={input} type="number" min="0" value={doubleBuyInBonusChips} onChange={(e) => setDoubleBuyInBonusChips(e.target.value)} placeholder="Opcional" />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Rebuy */}
          <div>
            <p className="text-xs font-medium text-sx-muted mb-2">Rebuy <span className="text-white/30 font-normal">(opcional)</span></p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={label}>Valor (R$)</label>
                <input className={input} type="number" step="0.01" value={form.rebuyAmount} onChange={(e) => set('rebuyAmount', e.target.value)} placeholder="—" />
              </div>
              <div>
                <label className={label}>Fichas</label>
                <input className={input} type="number" value={form.rebuyChips} onChange={(e) => set('rebuyChips', e.target.value)} placeholder="= buy-in" />
              </div>
              <div>
                <label className={label}>Duplo</label>
                <button
                  type="button"
                  onClick={() => { setDoubleRebuyEnabled((v) => !v); setDoubleRebuyBonusChips('') }}
                  style={{ background: doubleRebuyEnabled ? '#00C8E0' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
                  className="relative inline-flex h-[42px] w-full items-center rounded-xl transition-all duration-200 px-3 gap-2"
                >
                  <span className={`inline-block h-5 w-5 shrink-0 rounded-full bg-white shadow-md transition-transform duration-200 ${doubleRebuyEnabled ? 'translate-x-1' : ''}`} />
                  <span className="text-xs font-medium" style={{ color: doubleRebuyEnabled ? '#0a1628' : 'rgba(255,255,255,0.5)' }}>{doubleRebuyEnabled ? 'Habilitado' : 'Desabilitado'}</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div>
                <label className={label}>Taxa (R$)</label>
                <input className={input} type="number" step="0.01" value={form.rebuyTaxAmount} onChange={(e) => set('rebuyTaxAmount', e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <label className={label}>Fichas da taxa</label>
                <input className={input} type="number" value={form.rebuyTaxChips} onChange={(e) => set('rebuyTaxChips', e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                {doubleRebuyEnabled && (
                  <>
                    <label className={label}>Fichas bônus</label>
                    <input className={input} type="number" min="0" value={doubleRebuyBonusChips} onChange={(e) => setDoubleRebuyBonusChips(e.target.value)} placeholder="Opcional" />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Add-on */}
          <div>
            <p className="text-xs font-medium text-sx-muted mb-2">Add-on <span className="text-white/30 font-normal">(opcional)</span></p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={label}>Valor (R$)</label>
                <input className={input} type="number" step="0.01" value={form.addonAmount} onChange={(e) => set('addonAmount', e.target.value)} placeholder="—" />
              </div>
              <div>
                <label className={label}>Fichas</label>
                <input className={input} type="number" value={form.addonChips} onChange={(e) => set('addonChips', e.target.value)} placeholder="= buy-in" />
              </div>
              <div>
                <label className={label}>Após nível</label>
                <input className={input} type="number" value={form.addonAfterLevel} onChange={(e) => set('addonAfterLevel', e.target.value)} placeholder="Qualquer hora" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div>
                <label className={label}>Taxa (R$)</label>
                <input className={input} type="number" step="0.01" value={form.addonTaxAmount} onChange={(e) => set('addonTaxAmount', e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <label className={label}>Fichas da taxa</label>
                <input className={input} type="number" value={form.addonTaxChips} onChange={(e) => set('addonTaxChips', e.target.value)} placeholder="Opcional" />
              </div>
              <div />
            </div>
          </div>

          {/* Bounty */}
          <div>
            <label className={label}>Bounty por eliminação (R$)</label>
            <input className={input} type="number" step="0.01" value={form.bountyAmount} onChange={(e) => set('bountyAmount', e.target.value)} placeholder="Opcional" />
          </div>
        </section>

        {/* Blinds + Timer — seção unificada */}
        <section className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
          <h2 className="text-[11px] font-black uppercase tracking-widest text-sx-cyan">Estrutura de Blinds</h2>

          {/* Template + tempos globais */}
          <div>
            <label className={label}>Template</label>
            <select className={input} value={form.blindTemplateName} onChange={(e) => handleTemplateSelect(e.target.value)}>
              <option value="">Personalizado</option>
              {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <label className={label}>Tempo de blinds *</label>
              <input className={input} type="number" value={form.minutesPerLevelPreLateReg} onChange={(e) => set('minutesPerLevelPreLateReg', e.target.value)} required />
            </div>
            <div>
              <label className={label}>Late reg até nível</label>
              <input className={input} type="number" value={form.lateRegistrationLevel} onChange={(e) => set('lateRegistrationLevel', e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className={label}>Tempo de blinds após late</label>
              <input className={input} type="number" value={form.minutesPerLevelPostLateReg} onChange={(e) => set('minutesPerLevelPostLateReg', e.target.value)} placeholder="—" />
            </div>
          </div>

          {/* Tabela unificada: níveis + intervalos inline */}
          {customLevels.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40 border-b border-sx-border">
                    <th className="text-left py-1 pr-2">Nível</th>
                    <th className="text-right py-1 px-2">SB</th>
                    <th className="text-right py-1 px-2">BB</th>
                    <th className="text-right py-1 px-2">Ante</th>
                    <th className="text-right py-1 px-2">Tempo</th>
                    <th className="text-left py-1 px-2">Legenda</th>
                    <th className="text-right py-1 pl-2">Controles</th>
                  </tr>
                </thead>
                <tbody>
                  {customLevels.map((l, i) => {
                    const lateReg = parseInt(form.lateRegistrationLevel || '0')
                    const post = form.minutesPerLevelPostLateReg
                    const breakCutoff = breaks.filter(b => b.afterLevel).map(b => parseInt(b.afterLevel)).sort((a, b) => a - b)[0] ?? 0
                    const cutoff = lateReg > 0 ? lateReg : breakCutoff
                    const tempo = cutoff > 0 && l.level > cutoff && post ? post : (form.minutesPerLevelPreLateReg || '15')
                    const brk = breaks.find((b) => parseInt(b.afterLevel) === l.level)
                    return (
                      <React.Fragment key={i}>
                        <tr className="border-b border-sx-border/50">
                          <td className="py-1 pr-2 text-sx-muted">{l.level}</td>
                          <td className="py-1 px-2">
                            <input type="number" className="w-20 bg-sx-input border border-sx-border2 rounded px-2 py-1 text-right focus:outline-none focus:border-sx-cyan" value={l.smallBlind} onChange={(e) => updateLevel(i, 'smallBlind', e.target.value)} />
                          </td>
                          <td className="py-1 px-2">
                            <input type="number" className="w-20 bg-sx-input border border-sx-border2 rounded px-2 py-1 text-right focus:outline-none focus:border-sx-cyan" value={l.bigBlind} onChange={(e) => updateLevel(i, 'bigBlind', e.target.value)} />
                          </td>
                          <td className="py-1 px-2">
                            <input type="number" className="w-16 bg-sx-input border border-sx-border2 rounded px-2 py-1 text-right focus:outline-none focus:border-sx-cyan" value={l.ante} onChange={(e) => updateLevel(i, 'ante', e.target.value)} />
                          </td>
                          <td className="py-1 px-2 text-right text-sx-muted whitespace-nowrap">{tempo} min</td>
                          <td className="py-1 px-2">
                            <div className="flex items-center gap-1">
                              {form.lateRegistrationLevel && l.level <= parseInt(form.lateRegistrationLevel) && (
                                <span title="Late Registration aberto neste nível" className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)' }}>LR</span>
                              )}
                              {form.timeChipBonus && (form.timeChipUntilLevel ? l.level <= parseInt(form.timeChipUntilLevel) : true) && (
                                <span title="Time Chip ativo neste nível" className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(0,200,224,0.15)', color: '#00C8E0', border: '1px solid rgba(0,200,224,0.3)' }}>TC</span>
                              )}
                              {form.addonAfterLevel && l.level === parseInt(form.addonAfterLevel) && (
                                <span title="Add-on disponível após este nível" className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>AD</span>
                              )}
                            </div>
                          </td>
                          <td className="py-1 pl-2">
                            <div className="flex items-center gap-1 justify-end">
                              <button type="button" title="Inserir nível após este" onClick={() => insertLevelAfter(i)} className="text-white/25 hover:text-sx-cyan text-[11px]">+</button>
                              {!brk && (
                                <button type="button" title="Adicionar intervalo após este nível" onClick={() => setBreaks((bs) => [...bs, { id: Date.now().toString(), afterLevel: String(l.level), durationMinutes: '15' }])} className="text-white/25 hover:text-sx-amber text-[11px]">⏱</button>
                              )}
                              <button type="button" onClick={() => removeLevel(i)} className="text-white/30 hover:text-red-400">✕</button>
                            </div>
                          </td>
                        </tr>
                        {brk && (
                          <tr className="border-b border-sx-border/30" style={{ background: 'rgba(255,184,0,0.04)' }}>
                            <td colSpan={5} className="py-1.5 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded" style={{ background: 'rgba(255,184,0,0.12)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.25)' }}>INTERVALO</span>
                                <div className="flex items-center gap-1">
                                  <input type="number" className="w-16 bg-sx-input border border-sx-border2 rounded px-2 py-1 text-right focus:outline-none focus:border-sx-cyan" value={brk.durationMinutes} onChange={(e) => setBreaks((bs) => bs.map((b) => b.id === brk.id ? { ...b, durationMinutes: e.target.value } : b))} />
                                  <span className="text-sx-muted text-xs">min</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center gap-1">
                                {form.lateRegistrationLevel && l.level <= parseInt(form.lateRegistrationLevel) && (
                                  <span title="Late Registration ainda aberto neste intervalo" className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)' }}>LR</span>
                                )}
                                {form.addonAfterLevel && l.level === parseInt(form.addonAfterLevel) && (
                                  <span title="Add-on disponível neste intervalo" className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>AD</span>
                                )}
                              </div>
                            </td>
                            <td className="py-1.5 pl-2">
                              <div className="flex justify-end">
                                <button type="button" onClick={() => setBreaks((bs) => bs.filter((b) => b.id !== brk.id))} className="text-white/30 hover:text-red-400">✕</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={addLevel} className="text-xs text-sx-cyan hover:text-white w-full py-2 rounded-lg text-center" style={{ border: '1px dashed rgba(0,200,224,0.3)' }}>+ Nível</button>
        </section>

        <button
          type="button"
          onClick={handleSavePreset}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-sx-muted hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          Salvar como modelo
        </button>

        <button
          type="submit"
          disabled={saving}
          className="btn-sx-primary w-full py-3.5 rounded-xl font-black text-sx-bg text-sm disabled:opacity-50"
        >
          {saving ? 'Criando...' : 'Criar Torneio'}
        </button>
      </form>
      </div>
    </div>
  )
}
