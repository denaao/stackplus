'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'
import AppHeader from '@/components/AppHeader'

interface HomeGame {
  id: string
  name: string
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  address: string
  dayOfWeek: string
  startTime: string
  chipValue: string
  joinCode: string
  _count: { members: number; sessions: number }
}

export default function DashboardPage() {
  const router = useRouter()
  const { token, user, setAuth, logout } = useAuthStore()
  const [asOwner, setAsOwner] = useState<HomeGame[]>([])
  const [asCoHost, setAsCoHost] = useState<HomeGame[]>([])
  const [asPlayer, setAsPlayer] = useState<HomeGame[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [pwdCurrent, setPwdCurrent] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    // Roda uma vez no mount. Usar user nas deps causava loop (setAuth → re-render → re-fetch).
    if (!user) { router.push('/'); return }
    api.get('/auth/me')
      .then(({ data }) => { if (token && data?.id && data?.email) setAuth(token, data) })
      .catch(() => {})
    api.get('/home-games/mine/with-roles').then(({ data }) => {
      setAsOwner(data.asOwner || [])
      setAsCoHost(data.asCoHost || [])
      setAsPlayer(data.asPlayer || [])
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleLogout() { logout(); router.push('/') }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwdMsg(null)
    if (pwdNew.length < 6) { setPwdMsg({ tone: 'error', text: 'Nova senha deve ter ao menos 6 caracteres.' }); return }
    if (pwdNew !== pwdConfirm) { setPwdMsg({ tone: 'error', text: 'Confirmação não bate com a nova senha.' }); return }
    setPwdSaving(true)
    try {
      await api.put('/auth/password', { currentPassword: pwdCurrent, newPassword: pwdNew })
      setPwdMsg({ tone: 'ok', text: 'Senha trocada com sucesso.' })
      setPwdCurrent(''); setPwdNew(''); setPwdConfirm('')
      setTimeout(() => { setPwdModalOpen(false); setPwdMsg(null) }, 1500)
    } catch (err: any) {
      setPwdMsg({ tone: 'error', text: err?.response?.data?.error ?? (typeof err === 'string' ? err : 'Falha ao trocar senha') })
    } finally {
      setPwdSaving(false)
    }
  }

  function copyJoinCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 1500)
  }

  async function handleJoinHomeGame(e: React.FormEvent) {
    e.preventDefault()
    if (joinCode.trim().length !== 6) {
      setJoinError('O código tem 6 caracteres.')
      return
    }
    setJoining(true)
    setJoinError(null)
    try {
      const { data } = await api.post('/home-games/join', { joinCode: joinCode.trim().toUpperCase() })
      setJoinModalOpen(false)
      setJoinCode('')
      router.push(`/homegame/${data.id}/select`)
    } catch (err: any) {
      setJoinError(typeof err === 'string' ? err : 'Código inválido ou você já está neste home game.')
    } finally {
      setJoining(false)
    }
  }

  type Role = 'OWNER' | 'COHOST' | 'PLAYER'
  const roleStyles: Record<Role, { accent: string; border: string; shadow: string; badge: string; label: string }> = {
    OWNER: {
      accent: 'linear-gradient(180deg, #00C8E0 0%, rgba(0,200,224,0.2) 100%)',
      border: '1px solid rgba(0,200,224,0.35)',
      shadow: '0 4px 28px rgba(0,200,224,0.18), inset 0 1px 0 rgba(0,200,224,0.1)',
      badge: 'bg-sx-cyan/15 text-sx-cyan border-sx-cyan/40',
      label: 'DONO',
    },
    COHOST: {
      accent: 'linear-gradient(180deg, #009CB0 0%, rgba(0,156,176,0.2) 100%)',
      border: '1px solid rgba(0,156,176,0.3)',
      shadow: '0 4px 20px rgba(0,156,176,0.12), inset 0 1px 0 rgba(0,156,176,0.08)',
      badge: 'bg-sx-cyan-dim/15 text-sx-cyan-dim border-sx-cyan-dim/40',
      label: 'CO-HOST',
    },
    PLAYER: {
      accent: 'linear-gradient(180deg, #4A7A90 0%, rgba(74,122,144,0.15) 100%)',
      border: '1px solid rgba(74,122,144,0.25)',
      shadow: '0 2px 10px rgba(0,0,0,0.3)',
      badge: 'bg-sx-muted/10 text-sx-muted border-sx-muted/30',
      label: 'JOGADOR',
    },
  }

  async function handleDeleteHomeGame(game: HomeGame) {
    const confirmed = confirm('Excluir o Home Game inteiro e todos os dados vinculados? Esta acao nao pode ser desfeita.')
    if (!confirmed) return
    const typedName = prompt(`Para confirmar, digite exatamente o nome do Home Game:\n\n${game.name}`)
    if (typedName !== game.name) { alert('Nome nao confere. Exclusao cancelada.'); return }
    setDeletingId(game.id)
    try {
      await api.delete(`/home-games/${game.id}`)
      setAsOwner((prev) => prev.filter((g) => g.id !== game.id))
    } catch { alert('Nao foi possivel excluir o Home Game') } finally { setDeletingId(null) }
  }

  const gameTypeLabel: Record<'CASH_GAME' | 'TOURNAMENT', string> = { CASH_GAME: 'Cash Game', TOURNAMENT: 'Torneio' }

  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        userName={user?.name}
        onLogout={handleLogout}
        rightSlot={
          <button
            type="button"
            onClick={() => { setPwdMsg(null); setPwdCurrent(''); setPwdNew(''); setPwdConfirm(''); setPwdModalOpen(true) }}
            className="text-sx-muted hover:text-sx-cyan transition-colors text-lg"
            title="Trocar senha"
          >
            ⚙️
          </button>
        }
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-white">Meus Home Games</h2>
            <p className="text-sx-muted text-sm mt-1">Seus jogos como dono, co-host e jogador</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setJoinModalOpen(true)}
              className="border border-sx-border2 bg-sx-card hover:bg-sx-input text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Entrar com código
            </button>
            <button
              onClick={() => router.push('/homegame/create')}
              className="bg-sx-cyan hover:bg-sx-cyan-dim text-sx-bg font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              + Criar home game
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-sx-card border border-sx-border rounded-xl p-6 animate-pulse h-40" />
            ))}
          </div>
        ) : asOwner.length === 0 && asCoHost.length === 0 && asPlayer.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4 opacity-20">♠</p>
            <p className="text-lg font-medium text-white">Você ainda não tem home games</p>
            <p className="text-sm mt-1 text-sx-muted">Crie um novo ou entre em um existente com o código</p>
          </div>
        ) : (
          <div className="space-y-8">
            {([
              { role: 'OWNER' as Role,  title: 'Meus home games',  games: asOwner },
              { role: 'COHOST' as Role, title: 'Co-host em',       games: asCoHost },
              { role: 'PLAYER' as Role, title: 'Jogador em',       games: asPlayer },
            ]).filter(s => s.games.length > 0).map(section => {
              const style = roleStyles[section.role]
              return (
                <section key={section.role}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${style.badge}`}>
                      {style.label}
                    </span>
                    <h3 className="text-sm uppercase tracking-wide text-sx-muted">{section.title}</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {section.games.map((game) => {
                      const gameType = game.gameType || 'CASH_GAME'
                      const isOwner = section.role === 'OWNER'
                      return (
                        <div
                          key={game.id}
                          onClick={() => router.push(`/homegame/${game.id}/select`)}
                          className="relative rounded-2xl overflow-hidden transition-all group cursor-pointer"
                          style={{
                            background: 'linear-gradient(135deg, #0C2438 0%, #071828 55%, #050D15 100%)',
                            border: style.border,
                            boxShadow: style.shadow,
                          }}
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
                            style={{ background: style.accent }} />

                          <div className="pl-5 pr-5 pt-5 pb-4">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <h3 className="font-black text-lg text-white group-hover:text-sx-cyan transition-colors">{game.name}</h3>
                                <span className={`inline-block mt-1 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${style.badge}`}>
                                  {gameTypeLabel[gameType]}
                                </span>
                              </div>
                              <div className="relative flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-mono font-bold px-2 py-1 rounded"
                                    style={{ background: 'rgba(0,200,224,0.1)', color: '#00C8E0', border: '1px solid rgba(0,200,224,0.2)' }}>
                                    {game.joinCode}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); copyJoinCode(game.joinCode) }}
                                    className="h-7 w-7 rounded-md border border-sx-border bg-sx-input text-sx-muted hover:text-sx-cyan hover:border-sx-cyan/40 transition-colors"
                                    aria-label="Copiar código"
                                    title={copiedCode === game.joinCode ? 'Copiado!' : 'Copiar código'}
                                  >
                                    {copiedCode === game.joinCode ? '✓' : '⧉'}
                                  </button>
                                </div>
                                {isOwner && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setOpenMenuId((prev) => prev === game.id ? null : game.id) }}
                                      className="h-7 w-7 rounded-md border border-sx-border bg-sx-input text-sx-muted hover:text-white hover:border-sx-border2 transition-colors"
                                      aria-label="Abrir menu"
                                    >
                                      ⋮
                                    </button>
                                    {openMenuId === game.id && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute right-0 top-9 z-10 w-44 rounded-lg border border-sx-border bg-sx-card2 p-1 shadow-xl"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => { setOpenMenuId(null); handleDeleteHomeGame(game) }}
                                          disabled={deletingId === game.id}
                                          className="w-full rounded-md px-3 py-2 text-left text-sm text-red-300 hover:bg-sx-input disabled:opacity-50"
                                        >
                                          {deletingId === game.id ? 'Excluindo...' : 'Excluir Home Game'}
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            <p className="text-sx-muted text-sm mb-1">📍 {game.address}</p>
                            <p className="text-sx-muted text-sm mb-3">🕐 {game.dayOfWeek} às {game.startTime}</p>

                            <div className="flex gap-4 text-xs text-sx-muted">
                              <span>👥 {game._count.members} membros</span>
                              <span>🎮 {game._count.sessions} sessões</span>
                              <span>{gameType === 'CASH_GAME' ? `💵 R$ ${game.chipValue}/ficha` : '🏆 Estrutura de torneio'}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>

      {/* Join Home Game modal */}
      {/* Modal: Trocar senha */}
      {pwdModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !pwdSaving && setPwdModalOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-sx-border2 bg-sx-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white">Trocar senha</h3>
              <button
                onClick={() => !pwdSaving && setPwdModalOpen(false)}
                disabled={pwdSaving}
                className="text-white/40 hover:text-white disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="text-[11px] text-sx-muted uppercase tracking-widest">Senha atual</label>
                <input
                  type="password"
                  value={pwdCurrent}
                  onChange={(e) => setPwdCurrent(e.target.value)}
                  required
                  autoFocus
                  className="w-full mt-1 rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-cyan"
                />
              </div>
              <div>
                <label className="text-[11px] text-sx-muted uppercase tracking-widest">Nova senha</label>
                <input
                  type="password"
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  required
                  minLength={6}
                  className="w-full mt-1 rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-cyan"
                />
              </div>
              <div>
                <label className="text-[11px] text-sx-muted uppercase tracking-widest">Confirmar nova senha</label>
                <input
                  type="password"
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  required
                  minLength={6}
                  className="w-full mt-1 rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-cyan"
                />
              </div>
              {pwdMsg && (
                <div className={`rounded-lg px-3 py-2 text-xs ${pwdMsg.tone === 'ok' ? 'bg-sx-cyan/10 border border-sx-cyan/30 text-sx-cyan' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
                  {pwdMsg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={pwdSaving}
                className="w-full rounded-lg bg-sx-cyan hover:bg-sx-cyan-dim text-sx-bg font-bold py-2.5 disabled:opacity-50"
              >
                {pwdSaving ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </form>
          </div>
        </div>
      )}

      {joinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setJoinModalOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-sx-border2 bg-sx-card p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Entrar em um home game</h3>
            <p className="mt-1 text-sm text-sx-muted">Peça o código de 6 caracteres ao dono do home game.</p>
            <form onSubmit={handleJoinHomeGame} className="mt-4 space-y-3">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                autoFocus
                maxLength={6}
                className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-3 text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-sx-cyan"
              />
              {joinError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {joinError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setJoinModalOpen(false); setJoinCode(''); setJoinError(null) }}
                  className="flex-1 rounded-lg border border-sx-border2 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-sx-input"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={joining || joinCode.length !== 6}
                  className="flex-1 rounded-lg bg-sx-cyan px-4 py-2 text-sm font-bold text-sx-bg hover:bg-sx-cyan-dim disabled:opacity-50"
                >
                  {joining ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
