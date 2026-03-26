'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

export default function RegisterPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'PLAYER' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', form)
      setAuth(data.token, data.user)
      if (data.user.role === 'HOST') router.push('/dashboard')
      else router.push('/player/dashboard')
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Erro ao cadastrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-yellow-400 tracking-tight">STACKPLUS</h1>
          <p className="text-zinc-400 mt-2 text-sm">Crie sua conta</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-4">
          <h2 className="text-xl font-bold">Cadastro</h2>
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">Nome</label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" placeholder="Seu nome" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">E-mail</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" placeholder="seu@email.com" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">Senha</label>
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" placeholder="••••••" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">Tipo de conta</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400">
              <option value="PLAYER">Jogador</option>
              <option value="HOST">Host (organizador)</option>
            </select>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Cadastrando...' : 'Criar conta'}
          </button>
          <p className="text-center text-sm text-zinc-500">Já tem conta? <a href="/" className="text-yellow-400 hover:underline">Entrar</a></p>
        </form>
      </div>
    </div>
  )
}
