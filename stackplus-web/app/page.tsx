'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

function maskCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ cpf: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', {
        cpf: form.cpf.replace(/\D/g, ''),
        password: form.password,
      })
      setAuth(data.token, data.user)
      const role = data.user.role
      if (role === 'ADMIN') router.push('/admin/dashboard')
      else if (role === 'HOST') router.push('/dashboard')
      else if (role === 'CASHIER') router.push('/cashier/select')
      else router.push('/player/dashboard')
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Branding */}
        <div className="flex flex-col items-center mb-10 gap-3">
          <h1
            className="text-6xl font-black tracking-tight text-sx-cyan text-glow"
            style={{ letterSpacing: '-0.02em' }}
          >
            STACK+
          </h1>
          <div className="flex items-center gap-2.5">
            <span className="text-sx-muted text-[11px] uppercase tracking-[0.18em]">by</span>
            <Image
              src="/sx-poker-logo.png"
              alt="SX Poker"
              width={90}
              height={22}
              priority
              className="opacity-85"
            />
          </div>
          <p className="text-sx-muted text-sm mt-1 tracking-wide">Home Game Poker Manager</p>
        </div>

        {/* Form card */}
        <div className="card-sx rounded-2xl p-8 space-y-5">
          <h2 className="text-lg font-bold text-white">Entrar na sua conta</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] text-sx-muted uppercase tracking-widest font-medium">CPF</label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              className="w-full bg-sx-input border border-sx-border2 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan transition-colors placeholder:text-sx-muted/50"
              placeholder="000.000.000-00"
              maxLength={14}
              autoComplete="username"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-sx-muted uppercase tracking-widest font-medium">Senha</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan transition-colors placeholder:text-sx-muted/50"
              placeholder="••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            onClick={handleSubmit as any}
            className="btn-sx-primary w-full text-sx-bg font-black py-3.5 rounded-xl text-sm tracking-widest uppercase"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="text-center text-sm text-sx-muted pt-1">
            Não tem conta?{' '}
            <a href="/register" className="text-sx-cyan hover:underline font-semibold">
              Cadastrar
            </a>
          </p>
        </div>

      </div>
    </div>
  )
}
