'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import { useAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'

export default function CreateSessionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sx-bg" />}>
      <CreateSessionContent />
    </Suspense>
  )
}

function CreateSessionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout } = useAuthStore()

  const eventId = searchParams.get('eventId') ?? ''
  const homeGameId = searchParams.get('homeGameId') ?? ''

  const [form, setForm] = useState({
    name: '',
    pokerVariant: 'NLH',
    smallBlind: '',
    bigBlind: '',
    minimumBuyIn: '',
    minimumStayMinutes: '',
    jackpotEnabled: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  function handleBack() {
    if (eventId) router.push(`/event/${eventId}`)
    else if (homeGameId) router.push(`/homegame/${homeGameId}`)
    else router.back()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.smallBlind || !form.bigBlind) {
      setError('Informe small blind e big blind.')
      return
    }
    if (!form.minimumBuyIn) {
      setError('Informe o buy-in mínimo.')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        gameType: 'CASH_GAME',
        name: form.name.trim() || undefined,
        pokerVariant: form.pokerVariant || undefined,
        smallBlind: parseFloat(form.smallBlind),
        bigBlind: parseFloat(form.bigBlind),
        minimumBuyIn: parseFloat(form.minimumBuyIn),
        jackpotEnabled: form.jackpotEnabled,
      }
      if (form.minimumStayMinutes) payload.minimumStayMinutes = parseInt(form.minimumStayMinutes)

      let res
      if (eventId) {
        res = await api.post(`/events/${eventId}/sessions`, payload)
      } else {
        res = await api.post('/sessions', { ...payload, homeGameId })
      }

      router.push(`/session/${res.data.id}/manage`)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao criar mesa.'))
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sx-cyan'
  const label = 'block text-xs text-sx-muted mb-1'

  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        title="Nova Mesa de Cash Game"
        onBack={handleBack}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />

      <main className="max-w-lg mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Nome */}
          <div className="space-y-1">
            <label className={label}>Nome da mesa</label>
            <input
              className={input}
              type="text"
              maxLength={100}
              placeholder="Ex: Mesa 1 (opcional)"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          {/* Variante */}
          <div className="space-y-1">
            <label className={label}>Variante</label>
            <select
              className={input}
              value={form.pokerVariant}
              onChange={(e) => set('pokerVariant', e.target.value)}
            >
              <option value="NLH">No-Limit Hold&apos;em</option>
              <option value="PLO">Pot-Limit Omaha</option>
              <option value="PLO5">PLO 5 cartas</option>
              <option value="MIXED">Mixed</option>
            </select>
          </div>

          {/* Blinds */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={label}>Small Blind (fichas) *</label>
              <input
                className={input}
                type="number"
                step="0.5"
                min="0.5"
                placeholder="Ex: 1"
                value={form.smallBlind}
                onChange={(e) => set('smallBlind', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={label}>Big Blind (fichas) *</label>
              <input
                className={input}
                type="number"
                step="0.5"
                min="1"
                placeholder="Ex: 2"
                value={form.bigBlind}
                onChange={(e) => set('bigBlind', e.target.value)}
              />
            </div>
          </div>

          {/* Buy-in mínimo */}
          <div className="space-y-1">
            <label className={label}>Buy-in mínimo (fichas) *</label>
            <input
              className={input}
              type="number"
              step="1"
              min="1"
              placeholder="Ex: 100"
              value={form.minimumBuyIn}
              onChange={(e) => set('minimumBuyIn', e.target.value)}
            />
          </div>

          {/* Tempo mínimo */}
          <div className="space-y-1">
            <label className={label}>Tempo mínimo de jogo (min)</label>
            <input
              className={input}
              type="number"
              step="1"
              min="0"
              placeholder="Sem mínimo"
              value={form.minimumStayMinutes}
              onChange={(e) => set('minimumStayMinutes', e.target.value)}
            />
          </div>

          {/* Jackpot */}
          <div className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
            <div>
              <p className="text-sm font-bold">Jackpot</p>
              <p className="text-xs text-sx-muted mt-0.5">Habilitar acumulado de jackpot na mesa</p>
            </div>
            <button
              type="button"
              onClick={() => set('jackpotEnabled', !form.jackpotEnabled)}
              style={{
                background: form.jackpotEnabled ? '#00C8E0' : 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
              className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-all duration-200"
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 mt-0.5 ${form.jackpotEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full btn-sx-primary rounded-xl py-3.5 text-sm font-black text-sx-bg disabled:opacity-50"
            >
              {saving ? 'Criando mesa...' : 'Criar Mesa'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
