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
  const [games, setGames] = useState<HomeGame[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [connectingGameId, setConnectingGameId] = useState<string | null>(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [qrForGameName, setQrForGameName] = useState<string>('')
  const [qrRefreshing, setQrRefreshing] = useState(false)
  const [qrStatusMessage, setQrStatusMessage] = useState<string>('Aguardando leitura do QR code...')
  const [qrConnected, setQrConnected] = useState(false)
  const canManageWhatsApp = user?.role === 'ADMIN' || user?.role === 'HOST'

  useEffect(() => {
    if (!user) { router.push('/'); return }
    api.get('/auth/me')
      .then(({ data }) => { if (token && data?.id && data?.email) setAuth(token, data) })
      .catch(() => {})
    api.get('/home-games/mine').then(({ data }) => setGames(data)).finally(() => setLoading(false))
  }, [user, token, setAuth])

  function mapQrErrorMessage(error: unknown): string {
    const message = typeof error === 'string' ? error : ''
    const normalized = message.toLowerCase()
    if (normalized.includes('fetch failed') || normalized.includes('network error'))
      return 'Nao foi possivel conectar na Evolution API. Verifique EVOLUTION_API_URL e se o servico esta online.'
    if (normalized.includes('acesso negado') || normalized === 'forbidden')
      return 'Seu usuario nao tem permissao para conectar WhatsApp. Entre com perfil HOST ou ADMIN.'
    if (normalized.includes('token')) return 'Sua sessao expirou. Faca login novamente.'
    return message || 'Falha ao conectar WhatsApp'
  }

  function isMissingInstanceError(error: unknown): boolean {
    const message = (typeof error === 'string' ? error : '').toLowerCase()
    return message.includes('does not exist') || message.includes('nao existe') || message.includes('não existe') || message.includes('not found')
  }

  function handleLogout() { logout(); router.push('/') }

  async function handleDeleteHomeGame(game: HomeGame) {
    const confirmed = confirm('Excluir o Home Game inteiro e todos os dados vinculados? Esta acao nao pode ser desfeita.')
    if (!confirmed) return
    const typedName = prompt(`Para confirmar, digite exatamente o nome do Home Game:\n\n${game.name}`)
    if (typedName !== game.name) { alert('Nome nao confere. Exclusao cancelada.'); return }
    setDeletingId(game.id)
    try {
      await api.delete(`/home-games/${game.id}`)
      setGames((prev) => prev.filter((g) => g.id !== game.id))
    } catch { alert('Nao foi possivel excluir o Home Game') } finally { setDeletingId(null) }
  }

  function extractQrCodeBase64(payload: any): string | null {
    const value = payload?.response?.qrCodeBase64 || payload?.qrcode?.base64 || payload?.base64 || payload?.response?.qrcode?.base64 || null
    if (!value || typeof value !== 'string') return null
    if (value.startsWith('data:image')) return value
    return `data:image/png;base64,${value}`
  }

  function extractConnectionState(payload: any): string {
    return String(payload?.remote?.instance?.state || payload?.remote?.instance?.status || payload?.remote?.state || payload?.remote?.status || payload?.local?.status || '').toLowerCase()
  }

  function normalizeStateLabel(state: string): string {
    if (state === 'open' || state === 'connected') return 'conectado'
    if (state === 'connecting') return 'conectando'
    if (state === 'close' || state === 'closed' || state === 'disconnect' || state === 'disconnected') return 'desconectado'
    if (!state) return 'desconhecido'
    return state
  }

  async function checkConnectionStatus(showError = false) {
    try {
      const { data } = await api.get('/whatsapp/evolution/status')
      const state = extractConnectionState(data)
      if (state === 'open' || state === 'connected') {
        setQrConnected(true); setQrStatusMessage('WhatsApp conectado com sucesso. Voce ja pode fechar este modal.'); setQrError(null); return
      }
      setQrConnected(false)
      setQrStatusMessage(`Status atual: ${normalizeStateLabel(state)}. Se o QR expirou, clique em Atualizar QR code.`)
    } catch (error) { if (showError) setQrError(mapQrErrorMessage(error)) }
  }

  useEffect(() => {
    if (!qrModalOpen || !canManageWhatsApp || qrError || qrConnected) return
    const timer = setInterval(() => checkConnectionStatus(false), 5000)
    return () => clearInterval(timer)
  }, [qrModalOpen, canManageWhatsApp, qrError, qrConnected])

  async function handleConnectWhatsApp(game: HomeGame) {
    if (!canManageWhatsApp) {
      setQrError('Seu usuario nao tem permissao para conectar WhatsApp. Entre com perfil HOST ou ADMIN.')
      setQrForGameName(game.name); setQrModalOpen(true); return
    }
    setConnectingGameId(game.id); setQrError(null); setQrImage(null); setQrConnected(false)
    setQrStatusMessage('Gerando QR code...'); setQrForGameName(game.name); setQrModalOpen(true)
    try {
      let data: any
      try { const r = await api.get('/whatsapp/evolution/connect'); data = r.data }
      catch (error) { if (!isMissingInstanceError(error)) throw error; await api.post('/whatsapp/evolution/setup', {}); const r = await api.get('/whatsapp/evolution/connect'); data = r.data }
      const qr = extractQrCodeBase64(data)
      if (!qr) { setQrError('Nao foi possivel gerar o QR code agora. Tente novamente em alguns segundos.'); return }
      setQrImage(qr); setQrStatusMessage('QR code gerado. Escaneie com o WhatsApp do celular.')
      await checkConnectionStatus(false)
    } catch (error) { setQrError(mapQrErrorMessage(error)) } finally { setConnectingGameId(null) }
  }

  async function handleRefreshQr() {
    if (!canManageWhatsApp) { setQrError('Sem permissao para atualizar QR code.'); return }
    setQrRefreshing(true); setQrError(null); setQrConnected(false)
    try {
      const { data } = await api.get('/whatsapp/evolution/connect')
      const qr = extractQrCodeBase64(data)
      if (!qr) { setQrError('Nao foi possivel atualizar o QR code agora. Tente novamente.'); return }
      setQrImage(qr); setQrStatusMessage('QR code atualizado. Escaneie novamente no WhatsApp.')
      await checkConnectionStatus(false)
    } catch (error) {
      const message = mapQrErrorMessage(error)
      setQrError(message === 'Falha ao conectar WhatsApp' ? 'Falha ao atualizar QR code' : message)
    } finally { setQrRefreshing(false) }
  }

  const gameTypeLabel: Record<'CASH_GAME' | 'TOURNAMENT', string> = { CASH_GAME: 'Cash Game', TOURNAMENT: 'Torneio' }

  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        userName={user?.name}
        onProfile={() => router.push('/profile')}
        onLogout={handleLogout}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Meus Home Games</h2>
            <p className="text-sx-muted text-sm mt-1">Gerencie seus cash games e torneios</p>
          </div>
          <button
            onClick={() => router.push('/homegame/create')}
            className="bg-sx-cyan hover:bg-sx-cyan-dim text-sx-bg font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            + Novo Home Game
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-sx-card border border-sx-border rounded-xl p-6 animate-pulse h-40" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4 opacity-20">♠</p>
            <p className="text-lg font-medium text-white">Nenhum Home Game criado</p>
            <p className="text-sm mt-1 text-sx-muted">Crie seu primeiro para começar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {games.map((game) => {
              const gameType = game.gameType || 'CASH_GAME'
              return (
                <div key={game.id} className="bg-sx-card border border-sx-border rounded-xl p-6 transition-all group hover:border-sx-border2">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-white group-hover:text-sx-cyan transition-colors">{game.name}</h3>
                      <p className="mt-1 text-xs uppercase tracking-wide text-sx-muted">{gameTypeLabel[gameType]}</p>
                    </div>
                    <div className="relative flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleConnectWhatsApp(game) }}
                        disabled={connectingGameId === game.id || !canManageWhatsApp}
                        className="h-7 rounded-md border border-green-700 bg-green-900/40 px-2 text-xs font-semibold text-green-300 hover:bg-green-800/50 disabled:opacity-50"
                        title={canManageWhatsApp ? undefined : 'Disponivel apenas para HOST/ADMIN'}
                      >
                        {connectingGameId === game.id ? 'Gerando QR...' : 'WhatsApp'}
                      </button>
                      <span className="bg-sx-input text-sx-cyan text-xs font-mono font-bold px-2 py-1 rounded border border-sx-border">{game.joinCode}</span>
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
                    </div>
                  </div>

                  <p className="text-sx-muted text-sm mb-1">📍 {game.address}</p>
                  <p className="text-sx-muted text-sm mb-4">🕐 {game.dayOfWeek} às {game.startTime}</p>

                  <div className="flex gap-4 text-sm text-sx-muted">
                    <span>👥 {game._count.members} membros</span>
                    <span>🎮 {game._count.sessions} sessões</span>
                    <span>{gameType === 'CASH_GAME' ? `💵 R$ ${game.chipValue}/ficha` : '🏆 Estrutura de torneio'}</span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-sx-border">
                    <p className="text-sm font-semibold text-sx-muted mb-3 text-center uppercase tracking-wider">Iniciar</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(`/homegame/${game.id}?new=cash`) }}
                        className="rounded-lg border border-sx-cyan bg-sx-cyan/10 px-3 py-2 text-sm font-bold text-sx-cyan hover:bg-sx-cyan/20 transition-colors"
                      >
                        Cash Game
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(`/tournament/create?homeGameId=${game.id}`) }}
                        className="rounded-lg border border-sx-cyan/50 bg-sx-cyan/5 px-3 py-2 text-sm font-bold text-sx-cyan/80 hover:bg-sx-cyan/15 transition-colors"
                      >
                        Torneio
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(`/comanda?homeGameId=${game.id}`) }}
                        className="rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm font-bold text-white/60 hover:text-white hover:border-sx-cyan/50 transition-colors"
                      >
                        Comandas
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* WhatsApp QR Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQrModalOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-sx-border bg-sx-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Conectar WhatsApp</h3>
                <p className="text-xs text-sx-muted">Home Game: {qrForGameName}</p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="rounded-md border border-sx-border px-2 py-1 text-xs text-sx-muted hover:text-white hover:bg-sx-input"
              >
                Fechar
              </button>
            </div>
            {qrError ? (
              <div className="rounded-md border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-300">{qrError}</div>
            ) : qrImage ? (
              <div className="space-y-3">
                <div className={`rounded-md border p-3 text-sm ${qrConnected ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-300' : 'border-sx-border bg-sx-input text-white/70'}`}>
                  {qrStatusMessage}
                </div>
                <div className="rounded-lg bg-white p-3">
                  <img src={qrImage} alt="QR Code WhatsApp" className="h-auto w-full" />
                </div>
                <button type="button" onClick={() => checkConnectionStatus(true)} className="w-full rounded-md border border-sx-border bg-sx-input px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-sx-card2">
                  Verificar status da conexao
                </button>
                <button type="button" onClick={handleRefreshQr} disabled={qrRefreshing} className="w-full rounded-md border border-sx-border bg-sx-input px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-sx-card2 disabled:opacity-60">
                  {qrRefreshing ? 'Atualizando QR...' : 'Atualizar QR code'}
                </button>
                <p className="text-xs text-sx-muted">No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.</p>
              </div>
            ) : (
              <div className="rounded-md border border-sx-border bg-sx-input p-3 text-sm text-sx-muted">Gerando QR code...</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
