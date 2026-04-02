'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

type PixType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function maskCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14)
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function maskPhone(value: string) {
  const d = onlyDigits(value).slice(0, 13)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

function isValidCpf(value: string) {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i)
  let v1 = (sum * 10) % 11; if (v1 === 10) v1 = 0
  if (v1 !== Number(d[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i)
  let v2 = (sum * 10) % 11; if (v2 === 10) v2 = 0
  return v2 === Number(d[10])
}

function isValidCnpj(value: string) {
  const d = onlyDigits(value)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (base: string, w: number[]) => { const s = base.split('').reduce((a, c, i) => a + Number(c) * w[i], 0); const m = s % 11; return m < 2 ? 0 : 11 - m }
  const f = calc(d.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2])
  const s = calc(d.slice(0,12)+String(f), [6,5,4,3,2,9,8,7,6,5,4,3,2])
  return f === Number(d[12]) && s === Number(d[13])
}

function validatePixKey(pixType: PixType, pixKey: string) {
  const v = pixKey.trim()
  const d = onlyDigits(v)
  if (pixType === 'CPF') return isValidCpf(v)
  if (pixType === 'CNPJ') return isValidCnpj(v)
  if (pixType === 'PHONE') return d.length >= 10 && d.length <= 13
  if (pixType === 'EMAIL') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  if (pixType === 'RANDOM') return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  return false
}

function pixErrorMessage(pixType: PixType) {
  if (pixType === 'CPF') return 'Informe um CPF válido.'
  if (pixType === 'CNPJ') return 'Informe um CNPJ válido.'
  if (pixType === 'PHONE') return 'Telefone deve ter 10 a 13 dígitos.'
  if (pixType === 'EMAIL') return 'Informe um e-mail válido.'
  return 'Informe uma chave aleatória PIX válida (UUID).'
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const [form, setForm] = useState({ name: '', cpf: '', phone: '', pixType: 'CPF' as PixType, pixKey: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!user) { router.push('/'); return }
    api.get('/auth/me').then(({ data }) => {
      setForm({
        name: data.name || '',
        cpf: data.cpf ? maskCpf(data.cpf) : '',
        phone: data.phone || '',
        pixType: (data.pixType as PixType) || 'CPF',
        pixKey: data.pixKey || '',
      })
    }).finally(() => setLoading(false))
  }, [user])

  function handlePixTypeChange(pixType: PixType) {
    setForm((prev) => ({ ...prev, pixType, pixKey: '' }))
  }

  function handlePixKeyChange(value: string) {
    if (form.pixType === 'CPF') { setForm((prev) => ({ ...prev, pixKey: maskCpf(value) })); return }
    if (form.pixType === 'CNPJ') { setForm((prev) => ({ ...prev, pixKey: maskCnpj(value) })); return }
    if (form.pixType === 'PHONE') { setForm((prev) => ({ ...prev, pixKey: maskPhone(value) })); return }
    setForm((prev) => ({ ...prev, pixKey: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!validatePixKey(form.pixType, form.pixKey)) {
      setError(pixErrorMessage(form.pixType))
      return
    }

    if (form.cpf.trim() !== '' && !isValidCpf(form.cpf)) {
      setError('Informe um CPF válido.')
      return
    }

    if (form.pixType !== 'CPF' && form.pixType !== 'CNPJ' && !isValidCpf(form.cpf)) {
      setError('Para PIX por e-mail/telefone/chave aleatória, informe um CPF válido.')
      return
    }

    if (form.phone.trim()) {
      const d = onlyDigits(form.phone)
      if (d.length < 10 || d.length > 11) { setError('Telefone deve ter 10 ou 11 dígitos.'); return }
    }

    setSaving(true)
    try {
      const { data } = await api.put('/auth/me', {
        name: form.name.trim(),
        cpf: form.cpf.trim() || null,
        phone: form.phone.trim() || null,
        pixType: form.pixType,
        pixKey: form.pixKey.trim(),
      })
      setUser(data)
      setSuccess('Perfil atualizado com sucesso!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Erro ao salvar perfil')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-yellow-400 font-black text-2xl">STACKPLUS</div>

  const pixKeyValid = form.pixKey ? validatePixKey(form.pixType, form.pixKey) : null
  const needsCpfCnpj = form.pixType === 'EMAIL' || form.pixType === 'PHONE' || form.pixType === 'RANDOM'

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">←</button>
        <h1 className="font-bold">Meu Perfil</h1>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}
          {success && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3">{success}</div>}

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">Nome</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400"
              placeholder="Seu nome"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">Telefone <span className="text-zinc-600 normal-case">(opcional)</span></label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400"
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">CPF {form.pixType !== 'CPF' && form.pixType !== 'CNPJ' ? '' : <span className="text-zinc-600 normal-case">(opcional)</span>}</label>
            <input
              type="text"
              required={form.pixType !== 'CPF' && form.pixType !== 'CNPJ'}
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400"
              placeholder="000.000.000-00"
            />
          </div>

          <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-zinc-200">Chave PIX</p>
              <p className="text-xs text-zinc-400 mt-0.5">Usada para receber pagamentos e cobranças automáticas na liquidação da sessão.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">Tipo de chave</label>
              <select
                value={form.pixType}
                onChange={(e) => handlePixTypeChange(e.target.value as PixType)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400"
              >
                <option value="CPF">CPF ⭐ recomendado</option>
                <option value="CNPJ">CNPJ</option>
                <option value="EMAIL">E-mail</option>
                <option value="PHONE">Telefone</option>
                <option value="RANDOM">Chave aleatória</option>
              </select>
              {needsCpfCnpj && (
                <p className="text-xs text-amber-400 mt-1">
                  ⚠ Para cobranças e pagamentos automáticos é necessário CPF ou CNPJ. Com outras chaves alguns recursos financeiros ficarão indisponíveis.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">Chave</label>
              <input
                type={form.pixType === 'EMAIL' ? 'email' : 'text'}
                required
                value={form.pixKey}
                onChange={(e) => handlePixKeyChange(e.target.value)}
                className={`w-full bg-zinc-900 border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 ${
                  pixKeyValid === false ? 'border-red-500' : pixKeyValid === true ? 'border-green-500' : 'border-zinc-700'
                }`}
                placeholder={
                  form.pixType === 'CPF' ? '000.000.000-00'
                  : form.pixType === 'CNPJ' ? '00.000.000/0000-00'
                  : form.pixType === 'EMAIL' ? 'seu@email.com'
                  : form.pixType === 'PHONE' ? '(11) 99999-9999'
                  : '00000000-0000-0000-0000-000000000000'
                }
              />
              {pixKeyValid === false && <p className="text-xs text-red-400">{pixErrorMessage(form.pixType)}</p>}
              {pixKeyValid === true && <p className="text-xs text-green-400">✓ Chave PIX válida</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || pixKeyValid === false}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </main>
    </div>
  )
}
