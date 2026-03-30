'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

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
  const { user, logout } = useAuthStore()
  const [games, setGames] = useState<HomeGame[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [connectingGameId, setConnectingGameId] = useState<string | null>(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [qrForGameName, setQrForGameName] = useState<string>('')

  useEffect(() => {
    if (!user) { router.push('/'); return }
    api.get('/home-games/mine').then(({ data }) => setGames(data)).finally(() => setLoading(false))
  }, [user])

  function handleLogout() {
    logout()
    router.push('/')
  }

  async function handleDeleteHomeGame(game: HomeGame) {
    const confirmed = confirm('Excluir o Home Game inteiro e todos os dados vinculados? Esta acao nao pode ser desfeita.')
    if (!confirmed) return

    const typedName = prompt(`Para confirmar, digite exatamente o nome do Home Game:\n\n${game.name}`)
    if (typedName !== game.name) {
      alert('Nome nao confere. Exclusao cancelada.')
      return
    }

    setDeletingId(game.id)
    try {
      await api.delete(`/home-games/${game.id}`)
      setGames((prev) => prev.filter((g) => g.id !== game.id))
    } catch {
      alert('Nao foi possivel excluir o Home Game')
    } finally {
      setDeletingId(null)
    }
  }

  function extractQrCodeBase64(payload: any): string | null {
    const value =
      payload?.response?.qrCodeBase64 ||
      payload?.qrcode?.base64 ||
      payload?.base64 ||
      payload?.response?.qrcode?.base64 ||
      null

    if (!value || typeof value !== 'string') return null
    if (value.startsWith('data:image')) return value
    return `data:image/png;base64,${value}`
  }

  async function handleConnectWhatsApp(game: HomeGame) {
    setConnectingGameId(game.id)
    setQrError(null)
    setQrImage(null)
    setQrForGameName(game.name)
    setQrModalOpen(true)

    try {
      await api.post('/whatsapp/evolution/setup', {})
      const { data } = await api.get('/whatsapp/evolution/connect')
      const qr = extractQrCodeBase64(data)

      if (!qr) {
        setQrError('Nao foi possivel gerar o QR code agora. Tente novamente em alguns segundos.')
        return
      }

      setQrImage(qr)
    } catch (error) {
      setQrError(typeof error === 'string' ? error : 'Falha ao conectar WhatsApp')
    } finally {
      setConnectingGameId(null)
    }
  }

  const gameTypeLabel: Record<'CASH_GAME' | 'TOURNAMENT', string> = {
    CASH_GAME: 'Cash Game',
    TOURNAMENT: 'Torneio',
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-black text-yellow-400">STACKPLUS</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{user?.name}</span>
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-red-400 transition-colors">Sair</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Meus Home Games</h2>
            <p className="text-zinc-400 text-sm mt-1">Gerencie seus cash games e torneios</p>
          </div>
          <button onClick={() => router.push('/homegame/create')}
            className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-5 py-2.5 rounded-lg text-sm transition-colors">
            + Novo Home Game
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 animate-pulse h-40" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <p className="text-5xl mb-4">♠</p>
            <p className="text-lg font-medium">Nenhum Home Game criado</p>
            <p className="text-sm mt-1">Crie seu primeiro para começar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {games.map((game) => {
              const gameType = game.gameType || 'CASH_GAME'
              return (
              <div key={game.id} onClick={() => router.push(`/homegame/${game.id}`)}
                className="bg-zinc-900 border border-zinc-800 hover:border-yellow-400/40 rounded-xl p-6 cursor-pointer transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-lg group-hover:text-yellow-400 transition-colors">{game.name}</h3>
                    <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{gameTypeLabel[gameType]}</p>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleConnectWhatsApp(game)
                      }}
                      disabled={connectingGameId === game.id}
                      className="h-7 rounded-md border border-green-700 bg-green-900/40 px-2 text-xs font-semibold text-green-300 hover:bg-green-800/50 disabled:opacity-50"
                    >
                      {connectingGameId === game.id ? 'Gerando QR...' : 'WhatsApp'}
                    </button>
                    <span className="bg-zinc-800 text-yellow-400 text-xs font-mono font-bold px-2 py-1 rounded">{game.joinCode}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId((prev) => prev === game.id ? null : game.id)
                      }}
                      className="h-7 w-7 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                      aria-label="Abrir menu"
                    >
                      ⋮
                    </button>

                    {openMenuId === game.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-9 z-10 w-44 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null)
                            handleDeleteHomeGame(game)
                          }}
                          disabled={deletingId === game.id}
                          className="w-full rounded-md px-3 py-2 text-left text-sm text-red-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {deletingId === game.id ? 'Excluindo...' : 'Excluir Home Game'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-zinc-400 text-sm mb-1">📍 {game.address}</p>
                <p className="text-zinc-400 text-sm mb-4">🕐 {game.dayOfWeek} às {game.startTime}</p>
                <div className="flex gap-4 text-sm text-zinc-500">
                  <span>👥 {game._count.members} membros</span>
                  <span>🎮 {game._count.sessions} sessões</span>
                  <span>{gameType === 'CASH_GAME' ? `💵 R$ ${game.chipValue}/ficha` : '🏆 Estrutura de torneio'}</span>
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleConnectWhatsApp(game)
                    }}
                    disabled={connectingGameId === game.id}
                    className="w-full rounded-lg border border-green-700 bg-green-900/40 px-3 py-2 text-sm font-semibold text-green-300 hover:bg-green-800/50 disabled:opacity-50"
                  >
                    {connectingGameId === game.id ? 'Gerando QR code...' : 'Conectar WhatsApp deste Home Game'}
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </main>

      {qrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQrModalOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-100">Conectar WhatsApp</h3>
                <p className="text-xs text-zinc-400">Home Game: {qrForGameName}</p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Fechar
              </button>
            </div>

            {qrError ? (
              <div className="rounded-md border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-300">
                {qrError}
              </div>
            ) : qrImage ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-white p-3">
                  <img src={qrImage} alt="QR Code WhatsApp" className="h-auto w-full" />
                </div>
                <p className="text-xs text-zinc-400">No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.</p>
              </div>
            ) : (
              <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3 text-sm text-zinc-300">
                Gerando QR code...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
