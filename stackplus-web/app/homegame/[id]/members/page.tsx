'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import { useAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'
import { useConfirm } from '@/components/ConfirmDialog'

type MemberRole = 'PLAYER' | 'HOST' | 'DEALER' | 'SANGEUR'

interface Member {
  id: string
  role: MemberRole
  user: { id: string; name: string; email?: string }
}

interface HomeGame {
  id: string
  name: string
  host: { id: string; name: string }
  members: Member[]
}

const ROLE_LABELS: Record<MemberRole | 'HOST_OWNER', string> = {
  PLAYER:     'JOGADOR',
  HOST:       'CO-HOST',
  DEALER:     'DEALER',
  SANGEUR:    'SANGEUR',
  HOST_OWNER: 'DONO',
}

const ROLE_STYLE: Record<MemberRole | 'HOST_OWNER', { border: string; bg: string; color: string }> = {
  PLAYER:     { border: 'rgba(100,116,139,0.4)', bg: 'rgba(100,116,139,0.08)', color: '#94a3b8' },
  HOST:       { border: 'rgba(0,200,224,0.4)',   bg: 'rgba(0,200,224,0.12)',   color: '#00C8E0' },
  DEALER:     { border: 'rgba(168,85,247,0.4)',  bg: 'rgba(168,85,247,0.12)', color: '#c084fc' },
  SANGEUR:    { border: 'rgba(245,158,11,0.4)',  bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
  HOST_OWNER: { border: 'rgba(0,200,224,0.4)',   bg: 'rgba(0,200,224,0.12)',  color: '#00C8E0' },
}

const PROMOTE_OPTIONS: { role: MemberRole; label: string; icon: string }[] = [
  { role: 'HOST',    label: 'Co-Host',  icon: '🛡️' },
  { role: 'DEALER',  label: 'Dealer',   icon: '🃏' },
  { role: 'SANGEUR', label: 'Sangeur',  icon: '💼' },
]

export default function HomeGameMembersPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { user, logout } = useAuthStore()

  const { confirm, dialog: confirmDialog } = useConfirm()
  const [game, setGame] = useState<HomeGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null)
  // which member has the promote dropdown open
  const [dropdownUserId, setDropdownUserId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/home-games/${id}`)
      .then((r) => setGame(r.data))
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false))
  }, [id, router])

  useEffect(() => { load() }, [load])

  // close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownUserId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isOwner = !!user && !!game && user.id === game.host.id

  const handleSetRole = async (memberUserId: string, role: MemberRole) => {
    setDropdownUserId(null)
    const isDowngrade = role === 'PLAYER'
    const label = isDowngrade ? 'rebaixar a jogador' : `promover a ${ROLE_LABELS[role]}`
    const ok = await confirm(`Tem certeza que quer ${label} este membro?`, { title: 'Alterar papel', confirmLabel: 'Confirmar' })
    if (!ok) return

    setBusyUserId(memberUserId)
    setFeedback(null)
    try {
      await api.patch(`/home-games/${id}/members/${memberUserId}/role`, { role })
      setFeedback({ tone: 'ok', message: 'Papel atualizado.' })
      load()
    } catch (err) {
      setFeedback({ tone: 'error', message: getErrorMessage(err, 'Não foi possível atualizar o papel.') })
    } finally {
      setBusyUserId(null)
    }
  }

  if (loading) return <AppLoading />
  if (!game) return null

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
              ? 'Você é o dono. Pode promover membros a Co-Host, Dealer ou Sangeur.'
              : 'Somente o dono pode gerenciar papéis.'}
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
          {/* Dono */}
          <div className="px-4 py-3 flex items-center justify-between gap-3 bg-sx-cyan/5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{game.host.name}</div>
              <div className="text-xs text-sx-muted">Dono do home game</div>
            </div>
            <RoleBadge role="HOST_OWNER" />
          </div>

          {game.members.length === 0 ? (
            <div className="px-4 py-4 text-sm text-sx-muted text-center">
              Nenhum membro além do dono.
            </div>
          ) : (
            game.members.map((m) => {
              const role = (m.role ?? 'PLAYER') as MemberRole
              const busy = busyUserId === m.user.id
              const isPromotable = role === 'PLAYER'

              return (
                <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3 border-t border-sx-border2/50">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{m.user.name}</div>
                    {m.user.email && <div className="text-xs text-sx-muted truncate">{m.user.email}</div>}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <RoleBadge role={role} />

                    {isOwner && !busy && (
                      isPromotable ? (
                        // Dropdown de promoção
                        <div className="relative" ref={dropdownUserId === m.user.id ? dropdownRef : undefined}>
                          <button
                            type="button"
                            onClick={() => setDropdownUserId(prev => prev === m.user.id ? null : m.user.id)}
                            className="rounded-lg border border-sx-cyan/40 bg-sx-cyan/10 px-3 py-1.5 text-xs font-bold text-sx-cyan hover:bg-sx-cyan/20"
                          >
                            Promover ▾
                          </button>

                          {dropdownUserId === m.user.id && (
                            <div
                              ref={dropdownRef}
                              style={{
                                position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
                                background: '#0C2438', border: '1px solid rgba(0,200,224,0.25)',
                                borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                minWidth: '140px', overflow: 'hidden',
                              }}
                            >
                              {PROMOTE_OPTIONS.map((opt) => (
                                <button
                                  key={opt.role}
                                  type="button"
                                  onClick={() => handleSetRole(m.user.id, opt.role)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '10px 14px', background: 'none',
                                    border: 'none', cursor: 'pointer', color: '#e2e8f0',
                                    fontSize: '13px', fontWeight: 600, textAlign: 'left',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,200,224,0.08)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                >
                                  <span>{opt.icon}</span>
                                  <span>{opt.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        // Rebaixar de volta a PLAYER
                        <button
                          type="button"
                          onClick={() => handleSetRole(m.user.id, 'PLAYER')}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20"
                        >
                          Rebaixar
                        </button>
                      )
                    )}

                    {isOwner && busy && (
                      <span className="text-xs text-sx-muted px-3 py-1.5">...</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Legenda */}
        {isOwner && (
          <div style={{
            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ fontSize: '10px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
              Papéis disponíveis
            </div>
            {PROMOTE_OPTIONS.map(opt => (
              <div key={opt.role} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RoleBadge role={opt.role} />
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  aparece na lista de {opt.label.toLowerCase()}s
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function RoleBadge({ role }: { role: MemberRole | 'HOST_OWNER' }) {
  const s = ROLE_STYLE[role]
  return (
    <span style={{
      borderRadius: '9999px', border: `1px solid ${s.border}`,
      background: s.bg, color: s.color,
      padding: '2px 10px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {ROLE_LABELS[role]}
    </span>
  )
}
