'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

type PixType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function maskCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14)
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function maskPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 13)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

function isValidCpf(value: string) {
  const digits = onlyDigits(value)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i)
  let firstVerifier = (sum * 10) % 11
  if (firstVerifier === 10) firstVerifier = 0
  if (firstVerifier !== Number(digits[9])) return false

  sum = 0
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i)
  let secondVerifier = (sum * 10) % 11
  if (secondVerifier === 10) secondVerifier = 0
  return secondVerifier === Number(digits[10])
}

function isValidCnpj(value: string) {
  const digits = onlyDigits(value)
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false

  const calcVerifier = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  const first = calcVerifier(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = calcVerifier(digits.slice(0, 12) + String(first), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return first === Number(digits[12]) && second === Number(digits[13])
}

function validatePixKey(pixType: PixType, pixKey: string) {
  const value = pixKey.trim()
  const digits = onlyDigits(value)

  if (pixType === 'CPF') return isValidCpf(value)
  if (pixType === 'CNPJ') return isValidCnpj(value)
  if (pixType === 'PHONE') return digits.length >= 10 && digits.length <= 13
  if (pixType === 'EMAIL') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  if (pixType === 'RANDOM') return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  return false
}

function pixErrorMessage(pixType: PixType) {
  if (pixType === 'CPF') return 'Informe um CPF válido.'
  if (pixType === 'CNPJ') return 'Informe um CNPJ válido.'
  if (pixType === 'PHONE') return 'Informe um telefone válido com 10 a 13 dígitos.'
  if (pixType === 'EMAIL') return 'Informe um e-mail válido para chave PIX.'
  return 'Informe uma chave aleatória PIX válida (UUID).'
}

export default function RegisterPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    email: '',
    phone: '',
    password: '',
    pixType: 'CPF' as PixType,
    pixKey: '',
    role: 'PLAYER',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handlePixTypeChange(pixType: PixType) {
    setForm((prev) => ({ ...prev, pixType, pixKey: '' }))
  }

  function handlePixKeyChange(value: string) {
    if (form.pixType === 'CPF') {
      setForm((prev) => ({ ...prev, pixKey: maskCpf(value) }))
      return
    }
    if (form.pixType === 'CNPJ') {
      setForm((prev) => ({ ...prev, pixKey: maskCnpj(value) }))
      return
    }
    if (form.pixType === 'PHONE') {
      setForm((prev) => ({ ...prev, pixKey: maskPhone(value) }))
      return
    }
    setForm((prev) => ({ ...prev, pixKey: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!isValidCpf(form.cpf)) {
      setError('Informe um CPF válido.')
      return
    }

    if (form.phone.trim() !== '') {
      const phoneDigits = form.phone.replace(/\D/g, '')
      if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        setError('Telefone deve ter 10 ou 11 dígitos (com DDD).')
        return
      }
    }

    if (!validatePixKey(form.pixType, form.pixKey)) {
      setError(pixErrorMessage(form.pixType))
      return
    }

    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        name: form.name,
        cpf: form.cpf,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
        pixType: form.pixType,
        pixKey: form.pixKey,
      })
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
    <div className="min-h-screen flex items-center justify-center bg-sx-bg px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-sx-cyan tracking-tight">STACKPLUS</h1>
          <p className="text-sx-muted mt-2 text-sm">Crie sua conta</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-sx-card border border-sx-border rounded-xl p-8 space-y-4">
          <h2 className="text-xl font-bold">Cadastro</h2>
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Nome completo</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
              placeholder="Seu nome"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">CPF</label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              className={`w-full bg-sx-input border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan ${
                form.cpf && !isValidCpf(form.cpf) ? 'border-red-500' : form.cpf && isValidCpf(form.cpf) ? 'border-sx-cyan' : 'border-sx-border2'
              }`}
              placeholder="000.000.000-00"
              maxLength={14}
              autoComplete="username"
            />
            {form.cpf && !isValidCpf(form.cpf) && <p className="text-xs text-red-400">CPF inválido</p>}
            {form.cpf && isValidCpf(form.cpf) && <p className="text-xs text-sx-cyan">✓ CPF válido</p>}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">E-mail <span className="text-sx-muted normal-case">(opcional)</span></label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Telefone <span className="text-sx-muted normal-case">(opcional)</span></label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Senha</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Tipo de PIX</label>
            <select
              value={form.pixType}
              onChange={(e) => handlePixTypeChange(e.target.value as PixType)}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
            >
              <option value="CPF">CPF ⭐ recomendado</option>
              <option value="CNPJ">CNPJ</option>
              <option value="EMAIL">E-mail</option>
              <option value="PHONE">Telefone</option>
              <option value="RANDOM">Chave aleatória</option>
            </select>
            {(form.pixType === 'EMAIL' || form.pixType === 'PHONE' || form.pixType === 'RANDOM') && (
              <p className="text-xs text-amber-400 mt-1">
                ⚠ Para cobranças e pagamentos automáticos é necessário CPF ou CNPJ. Com outras chaves alguns recursos financeiros ficarão indisponíveis.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Chave PIX para recebimento</label>
            <input
              type={form.pixType === 'EMAIL' ? 'email' : 'text'}
              required
              value={form.pixKey}
              onChange={(e) => handlePixKeyChange(e.target.value)}
              className={`w-full bg-sx-input border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan ${
                form.pixKey && !validatePixKey(form.pixType, form.pixKey)
                  ? 'border-red-500'
                  : form.pixKey && validatePixKey(form.pixType, form.pixKey)
                    ? 'border-sx-cyan'
                    : 'border-sx-border2'
              }`}
              placeholder={
                form.pixType === 'CPF' ? '000.000.000-00'
                : form.pixType === 'CNPJ' ? '00.000.000/0000-00'
                : form.pixType === 'EMAIL' ? 'seu@email.com'
                : form.pixType === 'PHONE' ? '(11) 99999-9999'
                : '00000000-0000-0000-0000-000000000000'
              }
            />
            {form.pixKey && !validatePixKey(form.pixType, form.pixKey) && (
              <p className="text-xs text-red-400">{pixErrorMessage(form.pixType)}</p>
            )}
            {form.pixKey && validatePixKey(form.pixType, form.pixKey) && (
              <p className="text-xs text-sx-cyan">✓ Chave PIX válida</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Tipo de conta</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
            >
              <option value="PLAYER">Jogador</option>
              <option value="HOST">Host (organizador)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-sx-primary w-full text-sx-bg font-black py-3 rounded-xl text-sm tracking-widest uppercase"
          >
            {loading ? 'Cadastrando...' : 'Criar conta'}
          </button>
          <p className="text-center text-sm text-sx-muted">
            Já tem conta?{' '}
            <a href="/" className="text-sx-cyan hover:underline">Entrar</a>
          </p>
        </form>
      </div>
    </div>
  )
}
