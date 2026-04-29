'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'
import AppHeader from '@/components/AppHeader'
import { getErrorMessage } from '@/lib/errors'

export default function CreateEventPage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [venue, setVenue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleLogout() { logout(); router.push('/') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Informe o nome do evento.'); return }
    if (!startDate || !endDate) { setError('Informe as datas de início e fim.'); return }
    if (new Date(endDate) < new Date(startDate)) { setError('A data de fim deve ser após o início.'); return }

    setSaving(true)
    try {
      const { data } = await api.post('/events', {
        name: name.trim(),
        description: description.trim() || undefined,
        venue: venue.trim() || undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        chipValue: 1,
        isPublic: true,
        financialModule: 'HYBRID',
      })
      router.push(`/event/${data.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível criar o evento.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        module="Eventos"
        title="Novo Evento"
        onBack={() => router.push('/dashboard')}
        userName={user?.name}
        onLogout={handleLogout}
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
            <label className="text-xs uppercase tracking-wide text-sx-muted">Nome do evento *</label>
            <input
              type="text"
              maxLength={120}
              placeholder="Ex: StackPlus Open #1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-amber focus:outline-none"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-sx-muted">Descrição</label>
            <textarea
              maxLength={2000}
              rows={3}
              placeholder="Regras, premiação, informações gerais..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-amber focus:outline-none resize-none"
            />
          </div>

          {/* Local */}
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-sx-muted">Local / venue</label>
            <input
              type="text"
              maxLength={200}
              placeholder="Ex: Clube de Poker SP"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="w-full rounded-xl border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-amber focus:outline-none"
            />
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-sx-muted">Início *</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-sx-border2 bg-sx-input px-3 py-3 text-sm focus:border-sx-amber focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-sx-muted">Fim *</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-sx-border2 bg-sx-input px-3 py-3 text-sm focus:border-sx-amber focus:outline-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full btn-event-primary rounded-xl py-3.5 text-sm font-black text-sx-bg disabled:opacity-50"
            >
              {saving ? 'Criando evento...' : 'Criar Evento'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
