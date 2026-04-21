'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { getErrorMessage } from '@/lib/errors'

export default function CreateHomeGamePage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', address: '', financialModule: 'POSTPAID' as 'POSTPAID' | 'PREPAID' | 'HYBRID' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/home-games', form)
      router.push('/dashboard')
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao criar Home Game'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-sx-bg px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="text-sx-muted hover:text-white">←</button>
          <h1 className="text-2xl font-bold">Criar Home Game</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-sx-card border border-sx-border rounded-xl p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Nome do Home Game</label>
            <input
              type="text"
              required
              placeholder="Ex: Poker da Galera"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Endereço</label>
            <input
              type="text"
              required
              placeholder="Rua, número, bairro"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full bg-sx-input border border-sx-border2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sx-cyan transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted uppercase tracking-wide">Módulo Financeiro Inicial</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { key: 'POSTPAID', label: 'Pós-pago' },
                { key: 'PREPAID', label: 'Pré-pago' },
                { key: 'HYBRID', label: 'Híbrido' },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, financialModule: option.key as 'POSTPAID' | 'PREPAID' | 'HYBRID' }))}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                    form.financialModule === option.key
                      ? 'border-sx-cyan bg-sx-cyan/15 text-sx-cyan'
                      : 'border-sx-border2 bg-sx-input text-zinc-300 hover:bg-sx-border2'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>


          <button type="submit" disabled={loading}
            className="w-full bg-sx-cyan hover:bg-sx-cyan-dim text-sx-bg font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Criando...' : 'Criar Home Game'}
          </button>
        </form>
      </div>
    </div>
  )
}
