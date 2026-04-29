'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'
import { useSangeurAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'

export default function SangeurTournamentLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setSangeurAuth = useSangeurAuthStore((s) => s.setSangeurAuth)
  const token = useSangeurAuthStore((s) => s.token)
  const sangeur = useSangeurAuthStore((s) => s.sangeur)

  const usernameHint = searchParams.get('username') || ''

  const [form, setForm] = useState({
    eventId: searchParams.get('eventId') || '',
    cpf: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token && sangeur?.eventId) router.replace('/sangeur/tournament')
  }, [token, sangeur, router])

  function formatCpf(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/sangeur/event-login', {
        eventId: form.eventId.trim(),
        cpf: form.cpf.replace(/\D/g, ''),
        password: form.password,
      })
      setSangeurAuth(data.token, data.user, data.sangeur)
      router.push('/sangeur/tournament')
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao entrar como SANGEUR'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-sx-bg px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight text-sx-cyan">SANGEUR POS</h1>
          <p className="mt-2 text-sm text-sx-muted">Acesso operacional para torneios do evento</p>
          {usernameHint && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
              style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.2)' }}>
              <span className="text-xs text-sx-muted">Fazendo login como</span>
              <span className="text-xs font-bold text-sx-cyan">@{usernameHint}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-sx-border bg-sx-card p-6">
          <h2 className="text-xl font-bold text-zinc-100">Entrar — Torneio</h2>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-sx-muted">ID do Evento</label>
            <input
              type="text"
              required
              value={form.eventId}
              onChange={(e) => setForm((prev) => ({ ...prev, eventId: e.target.value }))}
              placeholder="Cole o ID do evento aqui"
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-sx-muted">CPF</label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={form.cpf}
              onChange={(e) => setForm((prev) => ({ ...prev, cpf: formatCpf(e.target.value) }))}
              placeholder="000.000.000-00"
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-sx-muted">Senha</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="••••••"
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-sx-primary w-full text-sx-bg font-black py-3 rounded-xl text-sm tracking-widest uppercase"
          >
            {loading ? 'Entrando...' : 'Entrar na POS de Torneio'}
          </button>
        </form>
      </div>
    </div>
  )
}
