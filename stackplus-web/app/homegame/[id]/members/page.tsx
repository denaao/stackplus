'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import { useAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'
import { useConfirm } from '@/components/ConfirmDialog'

interface Member {
  id: string
  role: 'PLAYER' | 'HOST'
  user: { id: string; name: string; email?: string }
}

interface HomeGame {
  id: string
  name: string
  host: { id: string; name: string }
  members: Member[]
}

export default function HomeGameMembersPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user, logout } = useAuthStore()

  const { confirm, dialog: confirmDialog } = useConfirm()
  const [game, setGame] = useState<HomeGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/home-games/${id}`)
      .then((r) => setGame(r.data))
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false))
  }, [id, router])

  useEffect(() => { load() }, [load])

  const isOwner = !!user && !!game && user.id === game.host.id

  const handleToggleRole = async (memberUserId: string, currentRole: 'PLAYER' | 'HOST') => {
    const next = currentRole === 'HOST' ? 'PLAYER' : 'HOST'
    const action = next === 'HOST' ? 'promover a co-host' : 'rebaixar a jogador'
    const ok = await confirm(`Tem certeza que quer ${action} este membro?`, { title: 'Alterar papel', confirmLabel: 'Confirmar' })
    if (!ok) return

    setBusyUserId(memberUserId)
    setFeedback(null)
    try {
      await api.patch(`/home-games/${id}/members/${memberUserId}/role`, { role: next })
      setFeedback({ tone: 'ok', message: `Papel atualizado.` })
      load()
    } catch (err) {
      setFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel atualizar o papel.') })
    } finally {
      setBusyUserId(null)
    }
  }

  if (loading) return <AppLoading />
  if (!game) return null

  // O dono nao aparece no array members (e um registro separado via hostId).
  // Listamos ele "virtualmente" no topo.
  const hostAsEntry = { id: `host-${game.host.id}`, role: 'HOST' as const, user: { id: game.host.id, name: game.host.name } }

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      {confirmDialog}
      <AppHeader
        title="Membros do Home Game"
        onBack={() => router.push(`/homegame/${id}/select`)}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">{game.name}</h2>
          <p className="mt-1 text-sm text-sx-muted">
            {isOwner
              ? 'Voce e o dono. Pode promover membros a co-host.'
              : 'Somente o dono pode gerenciar papeis.'}
          </p>
        </div>

        {feedback && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              feedback.tone === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-sx-cyan/30 bg-sx-cyan/10 text-sx-cyan'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="rounded-xl overflow-hidden border border-sx-border2">
          {/* Dono original */}
          <div className="px-4 py-3 flex items-center justify-between gap-3 bg-sx-cyan/5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{hostAsEntry.user.name}</div>
              <div className="text-xs text-sx-muted">Dono do home game</div>
            </div>
            <span className="shrink-0 rounded-full border border-sx-cyan/40 bg-sx-cyan/15 px-3 py-1 text-xs font-bold text-sx-cyan">
              DONO
            </span>
          </div>

          {/* Demais membros */}
          {game.members.length === 0 ? (
            <div className="px-4 py-4 text-sm text-sx-muted text-center">
              Nenhum membro alem do dono.
            </div>
          ) : (
            game.members.map((m) => {
              const role = m.role ?? 'PLAYER'
              const busy = busyUserId === m.user.id
              return (
                <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3 border-t border-sx-border2/50">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{m.user.name}</div>
                    {m.user.email && <div className="text-xs text-sx-muted truncate">{m.user.email}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        role === 'HOST'
                          ? 'border border-sx-cyan/40 bg-sx-cyan/15 text-sx-cyan'
                          : 'border border-sx-border2 bg-sx-input text-sx-muted'
                      }`}
                    >
                      {role === 'HOST' ? 'CO-HOST' : 'JOGADOR'}
                    </span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleToggleRole(m.user.id, role)}
                        disabled={busy}
                        className="rounded-lg border border-sx-cyan/40 bg-sx-cyan/10 px-3 py-1.5 text-xs font-bold text-sx-cyan hover:bg-sx-cyan/20 disabled:opacity-50"
                      >
                        {busy ? '...' : role === 'HOST' ? 'Rebaixar' : 'Promover'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}
