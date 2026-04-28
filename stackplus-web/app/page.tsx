'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const user = useAuthStore((s) => s.user)
  const [docType, setDocType] = useState<'CPF' | 'PASSPORT'>('CPF')
  const [form, setForm] = useState({ credential: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Se já está logado, redireciona direto pro destino certo em vez de mostrar o login.
  // ADMIN e PLAYER caem no mesmo /dashboard — não há painel admin dedicado (ainda).
  // O role ADMIN serve apenas pra autorização em endpoints sensiveis da API.
  useEffect(() => {
    if (!user) return
    const role = user.role
    if (role === 'CASHIER') router.replace('/cashier/select')
    else router.replace('/dashboard')
  }, [user, router])

  function handleCredentialChange(value: string) {
    if (docType === 'CPF') {
      const d = value.replace(/\D/g, '').slice(0, 11)
      const masked = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      setForm((p) => ({ ...p, credential: masked }))
    } else {
      setForm((p) => ({ ...p, credential: value.toUpperCase() }))
    }
  }

  function switchDocType(type: 'CPF' | 'PASSPORT') {
    setDocType(type)
    setForm((p) => ({ ...p, credential: '' }))
    setError('')
  }

  async function handleSubmit(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = docType === 'CPF'
        ? { documentType: 'CPF', cpf: form.credential.replace(/\D/g, ''), password: form.password }
        : { documentType: 'PASSPORT', passportNumber: form.credential.trim().toUpperCase(), password: form.password }
      const { data } = await api.post('/auth/login', payload)
      setAuth(data.token, data.user, data.refreshToken ?? null)
      const role = data.user.role
      if (role === 'CASHIER') router.push('/cashier/select')
      else router.push('/dashboard')
    } catch (err) {
      setError(getErrorMessage(err, 'Credenciais inválidas'))
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

          {/* Toggle CPF / Passaporte */}
          <div className="flex rounded-xl overflow-hidden border border-sx-border2">
            <button type="button" onClick={() => switchDocType('CPF')}
              className={`flex-1 py-2 text-xs font-bold transition-colors ${docType === 'CPF' ? 'bg-sx-cyan text-sx-bg' : 'bg-sx-input text-sx-muted hover:text-white'}`}>
              Brasileiro (CPF)
            </button>
            <button type="button" onClick={() => switchDocType('PASSPORT')}
              className={`flex-1 py-2 text-xs font-bold transition-colors ${docType === 'PASSPORT' ? 'bg-sx-cyan text-sx-bg' : 'bg-sx-input text-sx-muted hover:text-white'}`}>
              Estrangeiro
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] text-sx-muted uppercase tracking-widest font-medium">
              {docType === 'CPF' ? 'CPF' : 'Número do passaporte'}
            </label>
            <input
              type="text"
              inputMode={docType === 'CPF' ? 'numeric' : 'text'}
              required
              value={form.credential}
              onChange={(e) => handleCredentialChange(e.target.value)}
              className="w-full bg-sx-input border border-sx-border2 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan transition-colors placeholder:text-sx-muted/50"
              placeholder={docType === 'CPF' ? '000.000.000-00' : 'AB1234567'}
              maxLength={docType === 'CPF' ? 14 : 30}
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
            onClick={handleSubmit}
            className="btn-sx-primary w-full text-sx-bg font-black py-3.5 rounded-xl text-sm tracking-widest uppercase"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="text-center text-sm text-sx-muted pt-1">
            Não tem conta?{' '}
            <Link href="/register" className="text-sx-cyan hover:underline font-semibold">
              Cadastrar
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}
