'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import EventTabs from '@/components/EventTabs'
import { getErrorMessage } from '@/lib/errors'

type EventStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED'
type TournamentStatus = 'REGISTRATION' | 'RUNNING' | 'ON_BREAK' | 'FINISHED' | 'CANCELED'

interface Event {
  id: string
  name: string
  description?: string
  venue?: string
  status: EventStatus
  startDate: string
  endDate: string
  isPublic: boolean
  accessCode?: string
  chipValue: string
  financialModule: 'POSTPAID' | 'PREPAID' | 'HYBRID'
  bankBalance: string
  host: { id: string; name: string; email: string }
  staff: { id: string; role: string; user: { id: string; name: string } }[]
  _count: { sessions: number; comandas: number }
}

interface Session {
  id: string
  status: string
  gameType?: string
  name?: string
  createdAt: string
  _count: { playerStates: number; transactions: number }
}

interface Tournament {
  id: string
  name: string
  status: TournamentStatus
  buyInAmount: string
  prizePool: string
  createdAt: string
  _count?: { players: number }
}

const STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: 'Rascunho', OPEN: 'Aberto', IN_PROGRESS: 'Em Andamento',
  FINISHED: 'Finalizado', CANCELED: 'Cancelado',
}
const STATUS_COLOR: Record<EventStatus, string> = {
  DRAFT: 'text-sx-muted bg-white/5',
  OPEN: 'text-blue-300 bg-blue-400/10',
  IN_PROGRESS: 'text-sx-amber bg-sx-amber/10',
  FINISHED: 'text-sx-muted bg-white/5',
  CANCELED: 'text-red-400 bg-red-400/10',
}

const TOURN_STATUS_LABEL: Record<TournamentStatus, string> = {
  REGISTRATION: 'Inscrições', RUNNING: 'Rodando', ON_BREAK: 'Pausa',
  FINISHED: 'Finalizado', CANCELED: 'Cancelado',
}
const TOURN_STATUS_COLOR: Record<TournamentStatus, string> = {
  REGISTRATION: 'text-blue-300 bg-blue-400/10',
  RUNNING: 'text-sx-amber bg-sx-amber/10',
  ON_BREAK: 'text-yellow-300 bg-yellow-400/10',
  FINISHED: 'text-sx-muted bg-white/5',
  CANCELED: 'text-red-400 bg-red-400/10',
}

export default function EventPage() {
  const router = useRouter()
  const params = useParams()
  const { user, logout } = useAuthStore()
  const id = params.id as string

  const [event, setEvent] = useState<Event | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [evRes, sessRes, tournRes] = await Promise.all([
          api.get(`/events/${id}`),
          api.get(`/events/${id}/sessions`),
          api.get(`/events/${id}/tournaments`),
        ])
        setEvent(evRes.data)
        setSessions(sessRes.data)
        setTournaments(tournRes.data)
      } catch {
        router.push('/dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, router])

  function handleLogout() { logout(); router.push('/') }

  const isHost = !!user && !!event && (
    user.role === 'ADMIN' ||
    event.host.id === user.id ||
    event.staff.some((s) => s.user.id === user.id && s.role === 'HOST')
  )

  const myStaffRole = event?.staff.find((s) => s.user.id === user?.id)?.role
  const canManageTournament = isHost ||
    myStaffRole === 'TOURNAMENT_DIRECTOR' ||
    myStaffRole === 'CASHIER'

  const isActive = event ? !['FINISHED', 'CANCELED'].includes(event.status) : false

  async function transition(action: 'start' | 'finish' | 'cancel') {
    setFeedback(null)
    setTransitioning(true)
    try {
      const { data } = await api.patch(`/events/${id}/${action}`)
      setEvent(data)
      const labels: Record<string, string> = { start: 'iniciado', finish: 'finalizado', cancel: 'cancelado' }
      setFeedback({ tone: 'ok', text: `Evento ${labels[action]} com sucesso.` })
    } catch (err) {
      setFeedback({ tone: 'error', text: getErrorMessage(err, 'Erro ao atualizar status.') })
    } finally {
      setTransitioning(false)
    }
  }

  if (loading) return <AppLoading />
  if (!event) return null

  const cashSessions = sessions.filter((s) => s.gameType !== 'TOURNAMENT')

  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        title={event.name}
        onBack={() => router.push('/dashboard')}
        userName={user?.name}
        onLogout={handleLogout}
        rightSlot={
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[event.status]}`}>
            {STATUS_LABEL[event.status]}
          </span>
        }
      />

      <EventTabs eventId={id} active="MESAS" canManage={isHost} />

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {feedback && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.tone === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-sx-amber/30 bg-sx-amber/10 text-sx-amber'
          }`}>
            {feedback.text}
          </div>
        )}

        {/* Info card */}
        <div className="rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4"
          style={{ background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 100%)', border: '1px solid rgba(245,158,11,0.12)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-sx-muted mb-1">Início</p>
            <p className="text-sm font-bold">{new Date(event.startDate).toLocaleDateString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-sx-muted mb-1">Fim</p>
            <p className="text-sm font-bold">{new Date(event.endDate).toLocaleDateString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-sx-muted mb-1">Jogadores</p>
            <p className="text-sm font-bold">{event._count.comandas}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-sx-muted mb-1">Local</p>
            <p className="text-sm font-bold truncate">{event.venue || '—'}</p>
          </div>
        </div>

        {/* Status actions */}
        {isHost && (
          <div className="flex flex-wrap gap-2">
          </div>
        )}

        {/* ── Torneios ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Torneios</h2>
            {canManageTournament && isActive && (
              <button
                onClick={() => router.push(`/tournament/create?eventId=${id}`)}
                className="btn-event-primary rounded-xl px-4 py-2 text-sm font-black text-sx-bg"
              >
                + Novo Torneio
              </button>
            )}
          </div>

          {tournaments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sx-border py-8 text-center text-sx-muted text-sm">
              Nenhum torneio criado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  onClick={() => router.push(`/tournament/${t.id}`)}
                  className="relative flex items-center justify-between rounded-xl px-5 py-3 cursor-pointer transition-all"
                  style={{ background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 100%)', border: '1px solid rgba(245,158,11,0.12)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(245,158,11,0.3)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(245,158,11,0.12)' }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
                    style={{ background: t.status === 'RUNNING' ? '#F59E0B' : t.status === 'REGISTRATION' ? '#60a5fa' : 'rgba(255,255,255,0.1)' }} />
                  <div className="pl-2">
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className="text-xs text-sx-muted mt-0.5">
                      Buy-in R$ {Number(t.buyInAmount).toFixed(0)}
                      {t._count ? ` · ${t._count.players} jogadores` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageTournament && t.status === 'REGISTRATION' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/tournament/${t.id}/edit`) }}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all"
                        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}
                      >
                        Editar
                      </button>
                    )}
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${TOURN_STATUS_COLOR[t.status]}`}>
                      {TOURN_STATUS_LABEL[t.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Mesas de Cash Game ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Mesas de Cash Game</h2>
            {isHost && isActive && (
              <button
                onClick={() => router.push(`/session/create?eventId=${id}`)}
                className="btn-event-primary rounded-xl px-4 py-2 text-sm font-black text-sx-bg"
              >
                + Nova Mesa
              </button>
            )}
          </div>

          {cashSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sx-border py-8 text-center text-sx-muted text-sm">
              Nenhuma mesa de cash game criada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {cashSessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => router.push(`/session/${s.id}/manage`)}
                  className="relative flex items-center justify-between rounded-xl px-5 py-3 cursor-pointer transition-all"
                  style={{ background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 100%)', border: '1px solid rgba(245,158,11,0.12)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(245,158,11,0.3)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(245,158,11,0.12)' }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
                    style={{ background: s.status === 'ACTIVE' ? '#F59E0B' : 'rgba(255,255,255,0.1)' }} />
                  <div className="pl-2">
                    <p className="text-sm font-bold">{s.name || new Date(s.createdAt).toLocaleDateString('pt-BR')}</p>
                    <p className="text-xs text-sx-muted mt-0.5">
                      {s._count.playerStates} jogadores · {s._count.transactions} transações
                    </p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    s.status === 'ACTIVE' ? 'text-sx-amber bg-sx-amber/10' : 'text-sx-muted bg-white/5'
                  }`}>
                    {s.status === 'ACTIVE' ? 'Ativa' : s.status === 'WAITING' ? 'Aguardando' : 'Finalizada'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Staff ── */}
        <StaffTab eventId={id} event={event} isHost={isHost} onUpdate={setEvent} />

        {/* ── Sangeurs ── */}
        {isHost && <SangeurSection eventId={id} />}
      </main>
    </div>
  )
}

// ─── Sangeur Section ──────────────────────────────────────────────────────────

interface SangeurAccess {
  id: string
  userId: string
  username: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  user: { id: string; name: string; email: string | null }
}

function SangeurSection({ eventId }: { eventId: string }) {
  const [accesses, setAccesses] = useState<SangeurAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [username, setUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [qrModal, setQrModal] = useState<{ title: string; qrCode: string; info?: string } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    api.get(`/events/${eventId}/sangeurs`)
      .then((r) => setAccesses(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [eventId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!userId.trim()) { setError('Informe o ID do usuário.'); return }
    setSaving(true); setError(null); setSuccess(null)
    try {
      const { data } = await api.post(`/events/${eventId}/sangeurs`, {
        memberUserId: userId.trim(),
        username: username.trim() || undefined,
      })
      setAccesses((prev) => {
        const filtered = prev.filter((a) => a.userId !== data.access.userId)
        return [data.access, ...filtered]
      })
      setUserId(''); setUsername('')
      setSuccess(`${data.access.user.name} cadastrado como sangeur.`)
      if (data.activationQrCode) {
        setQrModal({
          title: `Acesso: ${data.access.user.name}`,
          qrCode: data.activationQrCode,
          info: `Login: /sangeur/tournament/login?eventId=${eventId}`,
        })
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao cadastrar sangeur.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(access: SangeurAccess) {
    setActionLoading(access.userId)
    try {
      const endpoint = access.isActive
        ? `/events/${eventId}/sangeurs/${access.userId}/disable`
        : `/events/${eventId}/sangeurs/${access.userId}/enable`
      const { data } = await api.patch(endpoint)
      setAccesses((prev) => prev.map((a) => a.userId === access.userId ? data : a))
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao atualizar acesso.'))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResetPassword(access: SangeurAccess) {
    setActionLoading(`reset-${access.userId}`)
    try {
      const { data } = await api.patch(`/events/${eventId}/sangeurs/${access.userId}/reset-password`)
      setAccesses((prev) => prev.map((a) => a.userId === access.userId ? data.access : a))
      setQrModal({
        title: `QR de ativação — ${access.user.name}`,
        qrCode: data.activationQrCode,
        info: 'Escaneie para definir uma nova senha.',
      })
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao resetar senha.'))
    } finally {
      setActionLoading(null)
    }
  }

  const loginUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/sangeur/tournament/login?eventId=${eventId}`
    : `/sangeur/tournament/login?eventId=${eventId}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-sx-muted">Sangeurs do evento</p>
        <button
          onClick={() => navigator.clipboard.writeText(loginUrl).catch(() => {})}
          className="text-[11px] px-3 py-1.5 rounded-lg font-bold transition-all"
          style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.2)', color: '#00C8E0' }}
          title={loginUrl}
        >
          📋 Copiar link de login
        </button>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}
      {success && <p className="text-xs text-sx-cyan">{success}</p>}

      {/* List */}
      {loading ? (
        <p className="text-xs text-sx-muted py-4 text-center">Carregando...</p>
      ) : accesses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sx-border py-6 text-center text-sx-muted text-sm">
          Nenhum sangeur cadastrado ainda.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,200,224,0.1)' }}>
          {accesses.map((a, i) => (
            <div
              key={a.id}
              className="flex items-center justify-between px-4 py-3 gap-2"
              style={{ borderBottom: i < accesses.length - 1 ? '1px solid rgba(0,200,224,0.06)' : undefined }}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{a.user.name}</p>
                <p className="text-xs text-sx-muted">
                  @{a.username}
                  {a.lastLoginAt && ` · último acesso ${new Date(a.lastLoginAt).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  a.isActive ? 'text-green-300 bg-green-400/10' : 'text-sx-muted bg-white/5'
                }`}>
                  {a.isActive ? 'Ativo' : 'Inativo'}
                </span>
                <button
                  onClick={() => handleToggle(a)}
                  disabled={actionLoading === a.userId}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B' }}
                >
                  {actionLoading === a.userId ? '...' : a.isActive ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => handleResetPassword(a)}
                  disabled={actionLoading === `reset-${a.userId}`}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                  style={{ background: 'rgba(0,200,224,0.06)', border: '1px solid rgba(0,200,224,0.15)', color: '#00C8E0' }}
                >
                  {actionLoading === `reset-${a.userId}` ? '...' : '🔑 Reset'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} className="rounded-xl p-4 space-y-3"
        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
        <p className="text-xs uppercase tracking-widest text-sx-muted">Cadastrar sangeur</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-sx-muted">ID do usuário</label>
            <input
              type="text"
              placeholder="UUID do usuário"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-sx-muted">Username (opcional)</label>
            <input
              type="text"
              placeholder="Gerado automaticamente"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl py-2.5 text-sm font-black text-sx-bg disabled:opacity-50 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #00C8E0, #0077A8)' }}
        >
          {saving ? 'Cadastrando...' : 'Cadastrar Sangeur'}
        </button>
      </form>

      {/* QR Modal */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setQrModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'linear-gradient(135deg, #0C2438 0%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-white text-center">{qrModal.title}</h3>
            <div className="flex justify-center">
              <img src={qrModal.qrCode} alt="QR Code" className="w-56 h-56 rounded-xl" />
            </div>
            {qrModal.info && (
              <p className="text-xs text-sx-muted text-center">{qrModal.info}</p>
            )}
            <button
              onClick={() => setQrModal(null)}
              className="w-full rounded-xl py-2.5 text-sm font-bold bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Staff Tab ────────────────────────────────────────────────────────────────

function StaffTab({ eventId, event, isHost, onUpdate }: {
  eventId: string
  event: Event
  isHost: boolean
  onUpdate: (e: Event) => void
}) {
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<'HOST' | 'CASHIER' | 'DEALER' | 'SANGEUR' | 'TOURNAMENT_DIRECTOR' | 'CASH_DIRECTOR'>('CASHIER')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const router = useRouter()

  const ROLE_LABEL: Record<string, string> = {
    HOST: 'Host', CASHIER: 'Caixa', DEALER: 'Dealer', SANGEUR: 'Sangeur',
    TOURNAMENT_DIRECTOR: 'Dir. Torneio', CASH_DIRECTOR: 'Dir. Cash',
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!userId.trim()) { setError('Informe o ID do usuário.'); return }
    setSaving(true); setError(null); setSuccess(null)
    try {
      const { data } = await api.post(`/events/${eventId}/staff`, { userId: userId.trim(), role })
      onUpdate({ ...event, staff: [...event.staff, data] })
      setUserId('')
      setSuccess(`${data.user.name} adicionado como ${ROLE_LABEL[role]}.`)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao adicionar staff.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(staffId: string) {
    setRemovingId(staffId)
    try {
      await api.delete(`/events/${eventId}/staff/${staffId}`)
      onUpdate({ ...event, staff: event.staff.filter((s) => s.id !== staffId) })
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao remover staff.'))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="space-y-5">
      {isHost && (
        <div className="flex justify-end">
          <button
            onClick={() => router.push(`/event/${eventId}/permissions`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}
          >
            ⚙️ Configurar permissões
          </button>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-sx-muted">Staff do evento</p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(245,158,11,0.1)' }}>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ background: 'rgba(245,158,11,0.05)', borderBottom: '1px solid rgba(245,158,11,0.08)' }}>
            <div>
              <p className="text-sm font-bold">{event.host.name}</p>
              <p className="text-xs text-sx-muted">{event.host.email}</p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-sx-amber bg-sx-amber/10">
              Host (criador)
            </span>
          </div>
          {event.staff.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-sx-muted">Nenhum staff adicional</div>
          ) : (
            event.staff.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid rgba(245,158,11,0.06)' }}>
                <p className="text-sm font-bold">{s.user.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-sx-muted bg-white/5">
                    {ROLE_LABEL[s.role] || s.role}
                  </span>
                  {isHost && (
                    <button
                      onClick={() => handleRemove(s.id)}
                      disabled={removingId === s.id}
                      className="text-[11px] text-red-400 hover:text-red-300 font-bold disabled:opacity-50"
                    >
                      {removingId === s.id ? '...' : 'Remover'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isHost && !['FINISHED', 'CANCELED'].includes(event.status) && (
        <form onSubmit={handleAdd} className="rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(245,158,11,0.1)' }}>
          <p className="text-xs uppercase tracking-widest text-sx-muted">Adicionar staff</p>

          {error && <p className="text-xs text-red-300">{error}</p>}
          {success && <p className="text-xs text-sx-amber">{success}</p>}

          <div className="space-y-1">
            <label className="text-xs text-sx-muted">ID do usuário</label>
            <input
              type="text"
              placeholder="UUID do usuário"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-amber focus:outline-none font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-sx-muted">Cargo</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-amber focus:outline-none"
            >
              <option value="HOST">Host</option>
              <option value="TOURNAMENT_DIRECTOR">Dir. Torneio</option>
              <option value="CASH_DIRECTOR">Dir. Cash Game</option>
              <option value="CASHIER">Caixa</option>
              <option value="SANGEUR">Sangeur</option>
              <option value="DEALER">Dealer</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full btn-event-primary rounded-xl py-2.5 text-sm font-black text-sx-bg disabled:opacity-50"
          >
            {saving ? 'Adicionando...' : 'Adicionar'}
          </button>
        </form>
      )}
    </div>
  )
}
