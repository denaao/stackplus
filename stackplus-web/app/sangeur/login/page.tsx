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
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight text-emerald-400">SANGEUR POS</h1>
          <p className="mt-2 text-sm text-zinc-400">Acesso operacional para venda de fichas na mesa</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-bold text-zinc-100">Entrar</h2>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">Home Game ID</label>
            <input
              type="text"
              required
              value={form.homeGameId}
              onChange={(e) => setForm((prev) => ({ ...prev, homeGameId: e.target.value }))}
              placeholder="UUID do Home Game"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">Usuário POS</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="usuario da SANGEUR"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">Senha</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="••••••"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 py-3 font-bold text-zinc-900 transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar na POS'}
          </button>
        </form>
      </div>
    </div>
  )
}
