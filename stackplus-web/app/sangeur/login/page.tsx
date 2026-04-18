'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useSangeurAuthStore } from '@/store/useStore'

export default function SangeurLoginPage() {
  const router = useRouter()
  const setSangeurAuth = useSangeurAuthStore((s) => s.setSangeurAuth)
  const token = useSangeurAuthStore((s) => s.token)
  const [form, setForm] = useState({ homeGameId: '', username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token) router.replace('/sangeur')
  }, [token, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/sangeur/login', {
        homeGameId: form.homeGameId.trim(),
        username: form.username.trim(),
        password: form.password,
      })
      setSangeurAuth(data.token, data.user, data.sangeur)
      router.push('/sangeur')
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Erro ao entrar como SANGEUR')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-sx-bg px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight text-sx-cyan">SANGEUR POS</h1>
          <p className="mt-2 text-sm text-sx-muted">Acesso operacional para venda de fichas na mesa</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-sx-border bg-sx-card p-6">
          <h2 className="text-xl font-bold text-zinc-100">Entrar</h2>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-sx-muted">Home Game ID</label>
            <input
              type="text"
              required
              value={form.homeGameId}
              onChange={(e) => setForm((prev) => ({ ...prev, homeGameId: e.target.value }))}
              placeholder="UUID do Home Game"
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-sx-muted">Usuário POS</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="usuario da SANGEUR"
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
            {loading ? 'Entrando...' : 'Entrar na POS'}
          </button>
        </form>
      </div>
    </div>
  )
}
