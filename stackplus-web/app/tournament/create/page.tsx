'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'

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
  const router = useRouter()
  const searchParams = useSearchParams()
  const homeGameId = searchParams.get('homeGameId') ?? ''

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<BlindTemplate[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [breaks, setBreaks] = useState<BreakConfig[]>([{ id: '1', afterLevel: '', durationMinutes: '15' }])

  const [form, setForm] = useState({
    name: '',
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
    setForm(preset.form)
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

  const removeLevel = (i: number) => setCustomLevels((ls) => ls.filter((_, idx) => idx !== i))

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
      const payload: any = {
        homeGameId,
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

      if (useCustom && customLevels.length > 0) {
        payload.blindLevels = customLevels
      } else if (form.blindTemplateName) {
        payload.blindTemplateName = form.blindTemplateName
      }

      const res = await api.post('/tournaments', payload)
      router.push(`/tournament/${res.data.id}`)
    } catch (err: any) {
      setError(err.message || 'Erro ao criar torneio')
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full bg-[#434c6b] border border-[#4a5475] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#B7D9BF]'
  const label = 'block text-xs text-[#B7D9BF]/80 mb-1'

  return (
    <div className="min-h-screen bg-[#2a3150] text-white p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[#B7D9BF]/80 hover:text-white">←</button>
        <h1 className="text-xl font-bold">Criar Torneio</h1>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}

      {/* Modelos salvos */}
      {presets.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-[#B7D9BF]/80 uppercase tracking-wider mb-2">Modelos salvos</h2>
          <div className="flex flex-col gap-2">
            {presets.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-[#39415C] border border-[#39415C] rounded-lg px-3 py-2">
                <span className="text-sm text-white">{p.presetName}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadPreset(p)}
                    className="text-xs text-[#B7D9BF] hover:text-white px-2 py-1 rounded hover:bg-[#434c6b]"
                  >
                    Carregar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(p.id)}
                    className="text-xs text-[#B7D9BF]/50 hover:text-red-400 px-2 py-1 rounded hover:bg-[#434c6b]"
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
        <section className="bg-[#39415C] rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[#B7D9BF]">Informações Básicas</h2>
          <div>
            <label className={label}>Nome do torneio *</label>
            <input className={input} value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Ex: Torneio Semanal" />
          </div>

          {/* Buy-in */}
          <div>
            <p className="text-xs font-medium text-[#B7D9BF]/80 mb-2">Buy-in</p>
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
                <label className={label}>Rake (%)</label>
                <input className={input} type="number" step="0.1" value={form.rake} onChange={(e) => set('rake', e.target.value)} placeholder="0" />
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
              <div />
            </div>
          </div>

          {/* Rebuy */}
          <div>
            <p className="text-xs font-medium text-[#B7D9BF]/80 mb-2">Rebuy <span className="text-[#B7D9BF]/40 font-normal">(opcional)</span></p>
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
                <label className={label}>Até nível</label>
                <input className={input} type="number" value={form.rebuyUntilLevel} onChange={(e) => set('rebuyUntilLevel', e.target.value)} placeholder="Sem limite" />
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
              <div />
            </div>
          </div>

          {/* Add-on */}
          <div>
            <p className="text-xs font-medium text-[#B7D9BF]/80 mb-2">Add-on <span className="text-[#B7D9BF]/40 font-normal">(opcional)</span></p>
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

        {/* Regras */}
        <section className="bg-[#39415C] rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[#B7D9BF]">Regras</h2>
          <div>
            <label className={label}>Late registration até nível</label>
            <input className={input} type="number" value={form.lateRegistrationLevel} onChange={(e) => set('lateRegistrationLevel', e.target.value)} placeholder="Sem limite" />
          </div>
        </section>

        {/* Timer */}
        <section className="bg-[#39415C] rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[#B7D9BF]">Tempo dos Níveis</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Tempo de blinds antes do late register (min) *</label>
              <input className={input} type="number" value={form.minutesPerLevelPreLateReg} onChange={(e) => set('minutesPerLevelPreLateReg', e.target.value)} required />
            </div>
            <div>
              <label className={label}>Tempo de blinds após o late register (min)</label>
              <input className={input} type="number" value={form.minutesPerLevelPostLateReg} onChange={(e) => set('minutesPerLevelPostLateReg', e.target.value)} placeholder="Igual ao anterior" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-[#B7D9BF]/80">Intervalos</p>
              <button
                type="button"
                onClick={() => setBreaks((bs) => [...bs, { id: Date.now().toString(), afterLevel: '', durationMinutes: '15' }])}
                className="text-xs text-[#B7D9BF] hover:text-white"
              >
                + Intervalo
              </button>
            </div>
            <div className="space-y-2">
              {breaks.map((b, i) => (
                <div key={b.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className={label}>Após nível</label>
                    <input className={input} type="number" value={b.afterLevel} onChange={(e) => setBreaks((bs) => bs.map((x, idx) => idx === i ? { ...x, afterLevel: e.target.value } : x))} placeholder="Nível" />
                  </div>
                  <div>
                    <label className={label}>Duração (min)</label>
                    <input className={input} type="number" value={b.durationMinutes} onChange={(e) => setBreaks((bs) => bs.map((x, idx) => idx === i ? { ...x, durationMinutes: e.target.value } : x))} placeholder="15" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setBreaks((bs) => bs.filter((_, idx) => idx !== i))}
                    className="pb-2 text-[#B7D9BF]/40 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Blinds */}
        <section className="bg-[#39415C] rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#B7D9BF]">Estrutura de Blinds</h2>
            <button type="button" onClick={addLevel} className="text-xs text-[#B7D9BF] hover:text-white">+ Nível</button>
          </div>

          <div>
            <label className={label}>Template</label>
            <select className={input} value={form.blindTemplateName} onChange={(e) => handleTemplateSelect(e.target.value)}>
              <option value="">Personalizado</option>
              {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          {customLevels.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#B7D9BF]/50 border-b border-[#39415C]">
                    <th className="text-left py-1 pr-2">Nível</th>
                    <th className="text-right py-1 px-2">SB</th>
                    <th className="text-right py-1 px-2">BB</th>
                    <th className="text-right py-1 px-2">Ante</th>
                    <th className="py-1 pl-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {customLevels.map((l, i) => (
                    <tr key={i} className="border-b border-[#39415C]/50">
                      <td className="py-1 pr-2 text-[#B7D9BF]/80">{l.level}</td>
                      <td className="py-1 px-2">
                        <input type="number" className="w-20 bg-[#434c6b] border border-[#4a5475] rounded px-2 py-1 text-right focus:outline-none focus:border-[#B7D9BF]" value={l.smallBlind} onChange={(e) => updateLevel(i, 'smallBlind', e.target.value)} />
                      </td>
                      <td className="py-1 px-2">
                        <input type="number" className="w-20 bg-[#434c6b] border border-[#4a5475] rounded px-2 py-1 text-right focus:outline-none focus:border-[#B7D9BF]" value={l.bigBlind} onChange={(e) => updateLevel(i, 'bigBlind', e.target.value)} />
                      </td>
                      <td className="py-1 px-2">
                        <input type="number" className="w-16 bg-[#434c6b] border border-[#4a5475] rounded px-2 py-1 text-right focus:outline-none focus:border-[#B7D9BF]" value={l.ante} onChange={(e) => updateLevel(i, 'ante', e.target.value)} />
                      </td>
                      <td className="py-1 pl-2">
                        <button type="button" onClick={() => removeLevel(i)} className="text-[#B7D9BF]/40 hover:text-red-400">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={handleSavePreset}
          className="w-full py-2 bg-[#434c6b] hover:bg-[#4f5878] border border-[#4a5475] rounded-xl text-sm text-[#B7D9BF]"
        >
          Salvar como modelo
        </button>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-sm disabled:opacity-50"
        >
          {saving ? 'Criando...' : 'Criar Torneio'}
        </button>
      </form>
    </div>
  )
}
