'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'

export default function CreateHomeGamePage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', address: '', dayOfWeek: '', startTime: '', chipValue: '', rules: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/home-games', { ...form, chipValue: parseFloat(form.chipValue) })
      router.push('/dashboard')
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Erro ao criar Home Game')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">←</button>
          <h1 className="text-2xl font-bold">Criar Home Game</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          {[
            { label: 'Nome do Home Game', key: 'name', type: 'text', placeholder: 'Ex: Poker da Galera' },
            { label: 'Endereço', key: 'address', type: 'text', placeholder: 'Rua, número, bairro' },
            { label: 'Dia da semana', key: 'dayOfWeek', type: 'text', placeholder: 'Ex: Sexta-feira' },
            { label: 'Horário', key: 'startTime', type: 'time', placeholder: '' },
            { label: 'Valor da ficha (R$)', key: 'chipValue', type: 'number', placeholder: '0.10' },
          ].map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">{field.label}</label>
              <input type={field.type} required={field.key !== 'rules'} placeholder={field.placeholder}
                value={(form as any)[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                step={field.key === 'chipValue' ? '0.01' : undefined}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 transition-colors" />
            </div>
          ))}

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">Regras (opcional)</label>
            <textarea rows={3} placeholder="Descreva as regras do seu torneio..."
              value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 transition-colors resize-none" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Criando...' : 'Criar Home Game'}
          </button>
        </form>
      </div>
    </div>
  )
}
