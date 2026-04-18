'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import { useAuthStore } from '@/store/useStore'

interface Tournament {
  id: string
  name: string
  status: 'REGISTRATION' | 'RUNNING' | 'ON_BREAK' | 'FINISHED' | 'CANCELED'
  buyInAmount: string | number
  _count?: { players: number }
  createdAt: string
}

interface HomeGame {
  id: string
  name: string
  host: { id: string }
}

const statusLabel: Record<string, string> = {
  REGISTRATION: 'Inscrições',
  RUNNING: 'Rodando',
  ON_BREAK: 'Intervalo',
  FINISHED: 'Finalizado',
  CANCELED: 'Cancelado',
}

const statusBadge: Record<string, string> = {
  REGISTRATION: 'text-blue-300 bg-blue-400/10',
  RUNNING: 'text-sx-cyan bg-sx-cyan/10',
  ON_BREAK: 'text-sx-cyan bg-sx-cyan/10',
  FINISHED: 'text-sx-muted bg-white/5',
  CANCELED: 'text-red-400 bg-red-400/10',
}

const statusBar: Record<string, string> = {
  REGISTRATION: '#60a5fa',
  RUNNING: '#00C8E0',
  ON_BREAK: '#00C8E0',
  FINISHED: 'rgba(255,255,255,0.15)',
  CANCELED: 'rgba(239,68,68,0.4)',
}

export default function TournamentsListPage() {
  const router = useRouter()
  const params = useParams()
  const { user, logout } = useAuthStore()
  const id = params.id as string

  const [game, setGame] = useState<HomeGame | null>(null)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get(`/home-games/${id}`),
      api.get('/tournaments', { params: { homeGameId: id } }),
    ])
      .then(([gameRes, tourRes]) => {
        setGame(gameRes.data)
        setTournaments(tourRes.data)
      })
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false))
  }, [id, router])

  function handleLogout() { logout(); router.push('/') }

  const isHost = user?.id === game?.host?.id

  if (loading) return <AppLoading />

  return (
    <div className="min-h-screen">
      <AppHeader
        onBack={() => router.push(`/homegame/${id}/select`)}
        userName={user?.name}
        onLogout={handleLogout}
      />

      <main className="max-w-3xl mx-auto px-4 py-8">

        {/* Header da seção */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white">Torneios</h2>
            <p className="mt-1 text-xs text-sx-muted">Crie e gerencie torneios do home game.</p>
          </div>
          {isHost && (
            <button
              onClick={() => router.push(`/tournament/create?homeGameId=${id}`)}
              className="btn-sx-primary px-5 py-2 rounded-xl text-sm font-black text-sx-bg"
            >
              + Novo Torneio
            </button>
          )}
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-16 rounded-2xl" style={{ border: '1px dashed rgba(0,200,224,0.2)' }}>
            <p className="text-sx-muted text-sm">Nenhum torneio ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tournaments.map((t) => (
              <div
                key={t.id}
                onClick={() => router.push(t.status === 'FINISHED' ? `/tournament/${t.id}/report` : `/tournament/${t.id}`)}
                className="relative rounded-xl overflow-hidden cursor-pointer group transition-all"
                style={{
                  background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
                  border: '1px solid rgba(0,200,224,0.12)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(0,200,224,0.3)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(0,200,224,0.12)' }}
              >
                <div className="absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{ background: statusBar[t.status] ?? 'rgba(255,255,255,0.15)' }} />

                <div className="pl-4 pr-4 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{t.name}</p>
                    <p className="text-xs text-sx-muted mt-0.5">
                      {t._count?.players ?? 0} jogadores • Buy-in R$ {Number(t.buyInAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === 'FINISHED' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/tournament/${t.id}/report`) }}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors"
                        style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.25)', color: '#00C8E0' }}
                      >
                        📊 Relatório
                      </button>
                    )}
                    {t.status === 'REGISTRATION' && isHost && (
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/tournament/${t.id}/edit`) }}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}
                        onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'white'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,200,224,0.4)' }}
                        onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)' }}
                      >
                        Editar
                      </button>
                    )}
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusBadge[t.status] ?? 'text-sx-muted bg-white/5'}`}>
                      {statusLabel[t.status] ?? t.status}
                    </span>
                    <span className="text-sx-muted group-hover:text-sx-cyan transition-colors text-sm">→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
