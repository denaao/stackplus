'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'
import { getErrorMessage } from '@/lib/errors'

type TokenState = 'loading' | 'valid' | 'invalid' | 'expired'

function SangeurAtivarContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [tokenState, setTokenState] = useState<TokenState>('loading')
  const [tokenMessage, setTokenMessage] = useState('')
  const [username, setUsername] = useState('')
  const [homeGameName, setHomeGameName] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setTokenState('invalid')
      setTokenMessage('Link inválido. Solicite um novo QR Code ao admin.')
      return
    }

    api
      .get(`/home-games/sangeur/activate/${token}`)
      .then(({ data }) => {
        setUsername(data.username)
        setHomeGameName(data.homeGameName)
        setTokenState('valid')
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 410) {
          setTokenState('expired')
          setTokenMessage('Este link expirou. Peça ao admin para gerar um novo QR Code.')
        } else {
          setTokenState('invalid')
          setTokenMessage('Link inválido ou já utilizado.')
        }
      })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')

    if (password.length < 6) {
      setSubmitError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setSubmitError('As senhas não coincidem.')
      return
    }

    setSubmitLoading(true)
    try {
      await api.post('/home-games/sangeur/activate', { token, password })
      setSuccess(true)
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Erro ao ativar a conta. Tente novamente.'))
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-sx-bg px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight text-sx-cyan">SANGEUR POS</h1>
          <p className="mt-2 text-sm text-sx-muted">Ativação de acesso ao POS</p>
        </div>

        {/* Loading */}
        {tokenState === 'loading' && (
          <div className="rounded-xl border border-sx-border bg-sx-card p-6 text-center text-sx-muted text-sm">
            Validando link…
          </div>
        )}

        {/* Token inválido ou expirado */}
        {(tokenState === 'invalid' || tokenState === 'expired') && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center space-y-3">
            <p className="text-sm font-bold text-red-300">
              {tokenState === 'expired' ? 'Link expirado' : 'Link inválido'}
            </p>
            <p className="text-xs text-red-400">{tokenMessage}</p>
          </div>
        )}

        {/* Sucesso */}
        {success && (
          <div className="rounded-xl border border-sx-cyan/30 bg-sx-cyan/5 p-6 text-center space-y-4">
            <div className="text-4xl">✓</div>
            <p className="text-base font-bold text-sx-cyan">Conta ativada com sucesso!</p>
            <p className="text-xs text-sx-muted">
              Sua senha foi criada. Agora você pode entrar no POS com o usuário{' '}
              <span className="font-mono text-zinc-300">{username}</span>.
            </p>
            <button
              onClick={() => router.push('/sangeur/login')}
              className="w-full rounded-xl border border-sx-cyan/40 bg-sx-cyan/10 py-3 text-sm font-black text-sx-cyan hover:bg-sx-cyan/20 uppercase tracking-widest"
            >
              Ir para o Login
            </button>
          </div>
        )}

        {/* Formulário de criação de senha */}
        {tokenState === 'valid' && !success && (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-sx-border bg-sx-card p-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-100">Criar senha</h2>
              {homeGameName && (
                <p className="mt-1 text-xs text-sx-muted">
                  Home Game: <span className="text-zinc-300">{homeGameName}</span>
                  {' · '}Usuário POS: <span className="font-mono text-zinc-300">{username}</span>
                </p>
              )}
            </div>

            {submitError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {submitError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-sx-muted">Nova senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-sx-muted">Confirmar senha</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitLoading}
              className="btn-sx-primary w-full text-sx-bg font-black py-3 rounded-xl text-sm tracking-widest uppercase"
            >
              {submitLoading ? 'Ativando…' : 'Ativar conta e criar senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function SangeurAtivarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-sx-bg px-4 py-8">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-black tracking-tight text-sx-cyan">SANGEUR POS</h1>
            <p className="mt-2 text-sm text-sx-muted">Ativação de acesso ao POS</p>
          </div>
          <div className="rounded-xl border border-sx-border bg-sx-card p-6 text-center text-sx-muted text-sm">
            Carregando…
          </div>
        </div>
      </div>
    }>
      <SangeurAtivarContent />
    </Suspense>
  )
}
