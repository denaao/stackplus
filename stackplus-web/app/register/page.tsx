'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'
import Link from 'next/link'

type PixType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM'
type DocumentType = 'CPF' | 'PASSPORT'

function onlyDigits(value: string) { return value.replace(/\D/g, '') }

function maskCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14)
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1\/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function maskPhone(value: string) {
  const d = onlyDigits(value).slice(0, 13)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

function isValidCpf(value: string) {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
  let v1 = (s * 10) % 11; if (v1 === 10) v1 = 0
  if (v1 !== +d[9]) return false
  s = 0
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
  let v2 = (s * 10) % 11; if (v2 === 10) v2 = 0
  return v2 === +d[10]
}

function isValidCnpj(value: string) {
  const d = onlyDigits(value)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calc = (base: string, w: number[]) => { const s = base.split('').reduce((a,c,i) => a + +c * w[i], 0); const m = s % 11; return m < 2 ? 0 : 11 - m }
  const f = calc(d.slice(0,12), [5,4,3,2,9,8,7,6,5,4,3,2])
  const sv = calc(d.slice(0,12)+f, [6,5,4,3,2,9,8,7,6,5,4,3,2])
  return f === +d[12] && sv === +d[13]
}

function validatePixKey(pixType: PixType, pixKey: string) {
  const v = pixKey.trim(); const d = onlyDigits(v)
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
  if (pixType === 'PHONE') return 'Informe um telefone válido com 10 a 13 dígitos.'
  if (pixType === 'EMAIL') return 'Informe um e-mail válido para chave PIX.'
  return 'Informe uma chave aleatória PIX válida (UUID).'
}

export default function RegisterPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [documentType, setDocumentType] = useState<DocumentType>('CPF')
  const [form, setForm] = useState({
    name: '', cpf: '', passportNumber: '', nationality: '',
    email: '', phone: '', password: '',
    pixType: 'CPF' as PixType, pixKey: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function switchDocumentType(type: DocumentType) {
    setDocumentType(type); setError('')
    setForm((prev) => ({ ...prev, cpf: '', passportNumber: '', nationality: '', pixType: 'CPF', pixKey: '' }))
  }

  function handlePixTypeChange(pixType: PixType) { setForm((prev) => ({ ...prev, pixType, pixKey: '' })) }

  function handlePixKeyChange(value: string) {
    if (form.pixType === 'CPF') { setForm((p) => ({ ...p, pixKey: maskCpf(value) })); return }
    if (form.pixType === 'CNPJ') { setForm((p) => ({ ...p, pixKey: maskCnpj(value) })); return }
    if (form.pixType === 'PHONE') { setForm((p) => ({ ...p, pixKey: maskPhone(value) })); return }
    setForm((p) => ({ ...p, pixKey: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')

    if (form.phone.trim()) {
      const pd = form.phone.replace(/\D/g, '')
      if (pd.length < 10 || pd.length > 11) { setError('Telefone deve ter 10 ou 11 dígitos (com DDD).'); return }
    }

    if (documentType === 'CPF') {
      if (!isValidCpf(form.cpf)) { setError('Informe um CPF válido.'); return }
      if (!form.pixKey.trim()) { setError('Informe a chave PIX.'); return }
      if (!validatePixKey(form.pixType, form.pixKey)) { setError(pixErrorMessage(form.pixType)); return }
    } else {
      if (form.passportNumber.trim().length < 3) { setError('Número do passaporte inválido.'); return }
      if (form.nationality.trim().length < 2) { setError('Informe a nacionalidade.'); return }
      if (form.pixKey.trim() && !validatePixKey(form.pixType, form.pixKey)) { setError(pixErrorMessage(form.pixType)); return }
    }

    setLoading(true)
    try {
      const base = { name: form.name, email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, password: form.password }
      const payload = documentType === 'CPF'
        ? { ...base, documentType: 'CPF' as const, cpf: form.cpf, pixType: form.pixType, pixKey: form.pixKey }
        : { ...base, documentType: 'PASSPORT' as const, passportNumber: form.passportNumber.trim().toUpperCase(), nationality: form.nationality.trim(),
            pixType: form.pixKey.trim() ? form.pixType : undefined,
            pixKey: form.pixKey.trim() || undefined }
      const { data } = await api.post('/auth/register', payload)
      setAuth(data.token, data.user, data.refreshToken ?? null)
      router.push('/dashboard')
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao cadastrar'))
    } finally {
      setLoading(false)
    }
  }

  const isForeign = documentType === 'PASSPORT'

  return (
    <div className="min-h-screen flex items-center justify-center bg-sx-bg px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-sx-cyan tracking-tight">STACKPLUS</h1>
          <p className="text-sx-muted mt-2 text-sm">Crie sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-sx-card border border-sx-border rounded-xl p-8 space-y-4">
          <h2 className="text-xl font-bold">Cadastro</h2>

          {/* Toggle Brasileiro / Estrangeiro */}
          <div className="flex rounded-xl overflow-hidden border border-sx-border2">
            <button type="button" onClick={() => switchDocumentType('CPF')}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${documentType === 'CPF' ? 'bg-sx-cyan text-sx-bg' : 'bg-sx-input text-sx-muted hover:text-white'}`}>
              Brasileiro (CPF)
            </button>
            <button type="button" onClick={() => switchDocumentType('PASSPORT')}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${documentType === 'PASSPORT' ? 'bg-sx-cyan text-sx-bg' : 'bg-sx-input text-sx-muted hover:text-white'}`}>
              Estrangeiro
            </button>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          {/* Nome */}
          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Nome completo</label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
              placeholder="Seu nome" />
          </div>

          {/* Documento */}
          {documentType === 'CPF' ? (
            <div className="space-y-1">
              <label className="text-xs text-sx-muted uppercase tracking-wide">CPF</label>
              <input type="text" inputMode="numeric" required value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
                className={`w-full bg-sx-input border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan ${form.cpf && !isValidCpf(form.cpf) ? 'border-red-500' : form.cpf && isValidCpf(form.cpf) ? 'border-sx-cyan' : 'border-sx-border2'}`}
                placeholder="000.000.000-00" maxLength={14} autoComplete="username" />
              {form.cpf && !isValidCpf(form.cpf) && <p className="text-xs text-red-400">CPF inválido</p>}
              {form.cpf && isValidCpf(form.cpf) && <p className="text-xs text-sx-cyan">CPF válido</p>}
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs text-sx-muted uppercase tracking-wide">Número do passaporte</label>
                <input type="text" required value={form.passportNumber}
                  onChange={(e) => setForm({ ...form, passportNumber: e.target.value.toUpperCase() })}
                  className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan font-mono tracking-wider"
                  placeholder="AB1234567" maxLength={30} autoComplete="off" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-sx-muted uppercase tracking-wide">Nacionalidade</label>
                <input type="text" required value={form.nationality}
                  onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                  className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
                  placeholder="Ex: Americana, Argentina, Uruguaia..." />
              </div>
            </>
          )}

          {/* E-mail */}
          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">E-mail <span className="normal-case text-sx-muted">(opcional)</span></label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
              placeholder="seu@email.com" />
          </div>

          {/* Telefone */}
          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Telefone <span className="normal-case text-sx-muted">(opcional)</span></label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
              placeholder="(11) 99999-9999" />
          </div>

          {/* Senha */}
          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Senha</label>
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan"
              placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
          </div>

          {/* PIX */}
          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">
              Tipo de PIX{isForeign && <span className="normal-case text-sx-muted"> (opcional)</span>}
            </label>
            <select value={form.pixType} onChange={(e) => handlePixTypeChange(e.target.value as PixType)}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan">
              {!isForeign && <option value="CPF">CPF (recomendado)</option>}
              <option value="CNPJ">CNPJ</option>
              <option value="EMAIL">E-mail</option>
              <option value="PHONE">Telefone</option>
              <option value="RANDOM">Chave aleatória</option>
            </select>
            {!isForeign && ['EMAIL','PHONE','RANDOM'].includes(form.pixType) && (
              <p className="text-xs text-amber-400 mt-1">Para cobranças automáticas é necessário CPF ou CNPJ.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">
              Chave PIX{isForeign && <span className="normal-case text-sx-muted"> (opcional)</span>}
            </label>
            <input
              type={form.pixType === 'EMAIL' ? 'email' : 'text'}
              required={!isForeign}
              value={form.pixKey}
              onChange={(e) => handlePixKeyChange(e.target.value)}
              className={`w-full bg-sx-input border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan ${form.pixKey && !validatePixKey(form.pixType, form.pixKey) ? 'border-red-500' : form.pixKey && validatePixKey(form.pixType, form.pixKey) ? 'border-sx-cyan' : 'border-sx-border2'}`}
              placeholder={form.pixType === 'CPF' ? '000.000.000-00' : form.pixType === 'CNPJ' ? '00.000.000/0000-00' : form.pixType === 'EMAIL' ? 'seu@email.com' : form.pixType === 'PHONE' ? '(11) 99999-9999' : '00000000-0000-0000-0000-000000000000'}
            />
            {form.pixKey && !validatePixKey(form.pixType, form.pixKey) && <p className="text-xs text-red-400">{pixErrorMessage(form.pixType)}</p>}
            {form.pixKey && validatePixKey(form.pixType, form.pixKey) && <p className="text-xs text-sx-cyan">Chave PIX válida</p>}
          </div>

          {isForeign && (
            <div className="rounded-lg px-3 py-2.5 text-xs text-sx-muted"
              style={{ background: 'rgba(0,200,224,0.05)', border: '1px solid rgba(0,200,224,0.15)' }}>
              Jogadores estrangeiros podem participar de eventos e home games. A chave PIX é necessária apenas para movimentações financeiras automáticas.
            </div>
          )}

          <button type="submit" disabled={loading}
            className="btn-sx-primary w-full text-sx-bg font-black py-3 rounded-xl text-sm tracking-widest uppercase">
            {loading ? 'Cadastrando...' : 'Criar conta'}
          </button>

          <p className="text-center text-sm text-sx-muted">
            Já tem conta?{' '}
            <Link href="/" className="text-sx-cyan hover:underline">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
